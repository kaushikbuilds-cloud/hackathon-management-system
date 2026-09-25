import "server-only";
import { certificateEvent, certificateFiles, certificateRecipients, type CertificateSettings } from "@/lib/certificates";
import { toCsv } from "@/lib/domain/csv";
import { BUCKETS, downloadObject, uploadObject } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/server";
import type { Hackathon } from "@/lib/types";
import { safeName } from "@/lib/zip";

type Row = Record<string, unknown>;

/** Every row of a hackathon's table (PostgREST returns at most 1000 per request). */
async function all(table: string, hackathonId: string, select = "*", filterColumn = "hackathon_id"): Promise<Row[]> {
  const service = createServiceClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from(table).select(select).eq(filterColumn, hackathonId).range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return rows;
}

/** CSV from objects: columns in first-seen order, nested values as JSON. */
function csv(rows: Row[], drop: string[] = []): string {
  const headers: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!headers.includes(k) && !drop.includes(k)) headers.push(k);
  return toCsv(headers, rows.map((r) => headers.map((h) => (r[h] !== null && typeof r[h] === "object" ? JSON.stringify(r[h]) : r[h]))));
}

const extOf = (path: string) => (path.match(/\.[A-Za-z0-9]{2,5}$/)?.[0] ?? "");

/**
 * Everything a hackathon produced, for the organisers to keep: data as CSV,
 * every stored file (payment proofs, ID card PDFs, photos, attachments,
 * branding) and every certificate. Callers must have checked access.
 */
export async function buildHackathonExport(hackathonId: string): Promise<{ name: string; files: Record<string, Uint8Array | string> }> {
  const service = createServiceClient();
  const { data: h } = await service.from("hackathons").select("*").eq("id", hackathonId).single<Hackathon & CertificateSettings>();
  if (!h) throw new Error("Hackathon not found");
  const files: Record<string, Uint8Array | string> = {};

  const [teams, participants, attendance, shops, items, orders, support, announcements, schedule, faqs, forms, submissions, audit, staff, jobs] = await Promise.all([
    all("teams", hackathonId), all("participant_overview", hackathonId), all("attendance", hackathonId),
    all("food_shops", hackathonId), all("food_items", hackathonId), all("food_orders", hackathonId, "*, food_order_items(name, price, qty)"),
    all("support_requests", hackathonId, "*, support_messages(body, is_internal, created_at)"),
    all("announcements", hackathonId), all("event_schedule", hackathonId), all("hackathon_faqs", hackathonId),
    all("registration_forms", hackathonId), all("registration_submissions", hackathonId), all("audit_logs", hackathonId),
    all("profiles", hackathonId, "id, full_name, email, role, status, team_id, shop_id, participant_id, last_sign_in_at, created_at"),
    all("id_card_jobs", hackathonId),
  ]);
  const teamCode = new Map(teams.map((t) => [t.id as string, t.team_code as string]));
  const partCode = new Map(participants.map((p) => [p.id as string, p.participant_code as string]));

  files["data/hackathon.csv"] = csv([h as unknown as Row]);
  files["data/teams.csv"] = csv(teams);
  files["data/participants.csv"] = csv(participants, ["qr_token"]);
  files["data/attendance.csv"] = csv(attendance.map((a) => ({ participant_code: partCode.get(a.participant_id as string), ...a })));
  files["data/payments.csv"] = csv(teams.filter((t) => t.payment_status && t.payment_status !== "not_required").map((t) => ({
    team_code: t.team_code, team_name: t.name, status: t.payment_status, amount: t.payment_amount, utr: t.payment_utr,
    submitted_at: t.payment_submitted_at, verified_at: t.payment_verified_at, note: t.payment_note,
  })));
  files["data/food_shops.csv"] = csv(shops);
  files["data/food_menu_items.csv"] = csv(items);
  files["data/food_orders.csv"] = csv(orders.map((o) => ({
    order_no: o.order_no, participant_code: partCode.get(o.participant_id as string), shop: shops.find((s) => s.id === o.shop_id)?.name,
    status: o.status, total: o.total, is_free: o.is_free, note: o.note, reject_reason: o.reject_reason,
    items: ((o.food_order_items as { name: string; qty: number; price: number }[]) ?? []).map((l) => `${l.qty} x ${l.name} @ ${l.price}`).join("; "),
    created_at: o.created_at, accepted_at: o.accepted_at, ready_at: o.ready_at, collected_at: o.collected_at,
  })));
  files["data/support_requests.csv"] = csv(support.map((r) => ({
    ...r, team_code: teamCode.get(r.team_id as string),
    messages: ((r.support_messages as { body: string; is_internal: boolean; created_at: string }[]) ?? []).map((m) => `[${m.created_at}${m.is_internal ? " internal" : ""}] ${m.body}`).join("\n"),
    support_messages: undefined,
  })), ["support_messages"]);
  files["data/announcements.csv"] = csv(announcements);
  files["data/schedule.csv"] = csv(schedule);
  files["data/faq.csv"] = csv(faqs);
  files["data/registration_forms.csv"] = csv(forms);
  files["data/registration_submissions.csv"] = csv(submissions);
  files["data/staff_and_logins.csv"] = csv(staff);
  files["data/audit_log.csv"] = csv(audit);

  // Stored files, named so they can be matched to the CSV rows.
  const fetches: Promise<void>[] = [];
  const grab = (bucket: string, path: unknown, name: string) => {
    if (typeof path !== "string" || !path) return;
    fetches.push(downloadObject(bucket, path).then((bytes) => { if (bytes) files[name] = bytes; }));
  };
  for (const t of teams) grab(BUCKETS.paymentProofs, t.payment_proof_path, `files/payment-proofs/${t.team_code}${extOf(String(t.payment_proof_path ?? ""))}`);
  const latestJob = new Map<string, Row>();
  for (const j of jobs) if (j.status === "completed" && j.file_path && (!latestJob.has(j.team_id as string) || String(j.created_at) > String(latestJob.get(j.team_id as string)!.created_at))) latestJob.set(j.team_id as string, j);
  for (const j of latestJob.values()) grab(BUCKETS.idCards, j.file_path, `files/id-cards/${teamCode.get(j.team_id as string) ?? j.team_id}_ID_Cards.pdf`);
  for (const p of participants) grab(BUCKETS.photos, p.photo_path, `files/photos/${p.participant_code}${extOf(String(p.photo_path ?? ""))}`);
  for (const r of support) grab(BUCKETS.attachments, r.attachment_path, `files/support-attachments/${String(r.id).slice(0, 8)}_${safeName(String(r.subject ?? ""))}${extOf(String(r.attachment_path ?? ""))}`);
  grab(BUCKETS.branding, h.logo_path, `files/branding/hackathon-logo${extOf(h.logo_path ?? "")}`);
  grab(BUCKETS.branding, h.organizer_logo_path, `files/branding/organiser-logo${extOf(h.organizer_logo_path ?? "")}`);
  grab(BUCKETS.branding, h.cert_signature1_path, `files/branding/signature-1${extOf(h.cert_signature1_path ?? "")}`);
  grab(BUCKETS.branding, h.cert_signature2_path, `files/branding/signature-2${extOf(h.cert_signature2_path ?? "")}`);
  await Promise.all(fetches);

  const people = await certificateRecipients(hackathonId);
  if (people.length) {
    const certs = await certificateFiles(await certificateEvent(h), people);
    for (const [path, bytes] of Object.entries(certs)) files[`certificates/${path}`] = bytes;
  }

  const count = (prefix: string) => Object.keys(files).filter((k) => k.startsWith(prefix)).length;
  files["README.txt"] = [
    `${h.name}: full data export from HackathonBase`,
    `Exported: ${new Date().toISOString()}   Status: ${h.status}${h.ended_at ? ` (ended ${h.ended_at})` : ""}`,
    "",
    `Teams: ${teams.length}   Participants: ${participants.length}   Check-ins: ${attendance.filter((a) => a.status === "present").length}`,
    `Food orders: ${orders.length}   Support requests: ${support.length}   Certificates: ${people.length}`,
    "",
    "data/          spreadsheets (CSV, open in Excel or Google Sheets)",
    `files/         payment proofs (${count("files/payment-proofs/")}), ID card PDFs (${count("files/id-cards/")}), photos (${count("files/photos/")}), support attachments (${count("files/support-attachments/")}), branding`,
    `certificates/  one PDF per person, a folder per team (${count("certificates/")})`,
    "",
    "Files are named by Team ID / Participant ID so they match the spreadsheets.",
  ].join("\r\n");

  return { name: `${safeName(h.name)}_full_export`, files };
}

const PART_LIMIT = 40 * 1024 * 1024; // storage caps one file at 50 MB (Supabase free plan)

export type StoredExport = { stamp: string; parts: { name: string; path: string; size: number }[] };

/**
 * Builds the full export and stores it privately as one or more ZIP parts
 * (spreadsheets and README always in part 1). Returns what was stored.
 */
export async function storeHackathonExport(hackathonId: string): Promise<StoredExport> {
  const { name, files } = await buildHackathonExport(hackathonId);
  const order = (p: string) => (p === "README.txt" ? 0 : p.startsWith("data/") ? 1 : p.startsWith("certificates/") ? 2 : p.startsWith("files/id-cards/") ? 4 : 3);
  const paths = Object.keys(files).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const groups: string[][] = [[]];
  let size = 0;
  for (const p of paths) {
    const len = typeof files[p] === "string" ? (files[p] as string).length : (files[p] as Uint8Array).length;
    if (size + len > PART_LIMIT && groups[groups.length - 1].length) { groups.push([]); size = 0; }
    groups[groups.length - 1].push(p);
    size += len;
  }
  const { makeZip } = await import("@/lib/zip");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const stored: StoredExport = { stamp, parts: [] };
  for (const [i, group] of groups.entries()) {
    const zip = makeZip(Object.fromEntries(group.map((p) => [p, files[p]])));
    const fileName = groups.length > 1 ? `${name}_part-${i + 1}-of-${groups.length}.zip` : `${name}.zip`;
    const path = `${hackathonId}/exports/${stamp}/${fileName}`;
    await uploadObject(BUCKETS.exports, path, zip, "application/zip");
    stored.parts.push({ name: fileName, path, size: zip.length });
  }
  return stored;
}

/** The most recent stored export of a hackathon, if any. */
export async function latestHackathonExport(hackathonId: string): Promise<StoredExport | null> {
  const bucket = createServiceClient().storage.from(BUCKETS.exports);
  const { data: stamps } = await bucket.list(`${hackathonId}/exports`, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (!Array.isArray(stamps)) return null;
  const stamp = stamps.map((s) => s.name).filter((n) => /^\d{8}-\d{6}$/.test(n)).sort().at(-1);
  if (!stamp) return null;
  const { data: parts } = await bucket.list(`${hackathonId}/exports/${stamp}`, { limit: 100, sortBy: { column: "name", order: "asc" } });
  return {
    stamp,
    parts: (Array.isArray(parts) ? parts : []).filter((p) => p.name.endsWith(".zip")).map((p) => ({ name: p.name, path: `${hackathonId}/exports/${stamp}/${p.name}`, size: Number(p.metadata?.size ?? 0) })),
  };
}
