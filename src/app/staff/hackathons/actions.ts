"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/domain/template";
import { fromLocalInput, isValidTimeZone } from "@/lib/format";
import { HACKATHON_COOKIE } from "@/lib/hackathon-context";
import { createInvitation } from "@/lib/invitations";
import { grantableTo } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";

export type CreateHackathonState = {
  error?: string;
  hackathon?: { id: string; name: string; slug: string };
  invite?: { link: string; email: string; name: string; expiresAt: string };
};

const createSchema = z.object({
  name: z.string().trim().min(2, "Hackathon name is required").max(120),
  organizer_name: z.string().trim().max(150),
  venue: z.string().trim().max(200),
  timezone: z.string().trim().refine(isValidTimeZone, "Unknown time zone"),
  starts_at: z.string().trim(),
  ends_at: z.string().trim(),
  contact_email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid contact email")]),
  admin_name: z.string().trim().max(100),
  admin_email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid Admin email")]),
});

/** Every Admin permission: the organiser runs their own event (including Officials). */
const ADMIN_GRANTS = grantableTo("admin").map((p) => p.key);

async function inviteAdmin(session: Awaited<ReturnType<typeof requireSuperAdmin>>, hackathonId: string, name: string, email: string) {
  const service = createServiceClient(session.userId);
  const { data: existing } = await service.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return { error: `An account with ${email} already exists. Use a different email for this hackathon's Admin.` };
  const invitation = await createInvitation(session, { hackathonId, role: "admin", email, fullName: name, permissions: ADMIN_GRANTS });
  await audit({ ...session, hackathonId }, "invitation.created", { type: "invitations", id: invitation.id }, { role: "admin", email, hackathon_id: hackathonId });
  return { invite: { link: invitation.url, email, name, expiresAt: invitation.expiresAt } };
}

export async function createHackathon(_prev: CreateHackathonState, formData: FormData): Promise<CreateHackathonState> {
  const session = await requireSuperAdmin();
  const parsed = createSchema.safeParse({
    name: str(formData, "name", 200), organizer_name: str(formData, "organizer_name", 200), venue: str(formData, "venue", 250),
    timezone: str(formData, "timezone", 60) || "Asia/Kolkata", starts_at: str(formData, "starts_at", 30), ends_at: str(formData, "ends_at", 30),
    contact_email: str(formData, "contact_email", 254), admin_name: str(formData, "admin_name", 120), admin_email: str(formData, "admin_email", 254),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.admin_email && d.admin_name.length < 2) return { error: "Enter the Admin's name, or leave both Admin fields empty." };
  const starts = fromLocalInput(d.starts_at, d.timezone);
  const ends = fromLocalInput(d.ends_at, d.timezone);
  if (starts && ends && ends < starts) return { error: "The hackathon must end after it starts." };

  const service = createServiceClient(session.userId);
  const { data: h, error } = await service
    .from("hackathons")
    .insert({
      name: d.name, organizer_name: d.organizer_name || null, venue: d.venue || null, timezone: d.timezone,
      starts_at: starts, ends_at: ends, contact_email: d.contact_email || null, status: "setup", created_by: session.userId,
      id_year: Number((starts ?? new Date().toISOString()).slice(0, 4)),
    })
    .select("id, name, slug")
    .single<{ id: string; name: string; slug: string }>();
  if (error || !h) return { error: dbErrorMessage(error, "Could not create the hackathon.") };

  // A ready-to-use card template so ID cards work from day one.
  await service.from("id_card_templates").insert({
    hackathon_id: h.id, version: 1, name: "Default card", is_active: true, config: DEFAULT_TEMPLATE_CONFIG, created_by: session.userId,
  });
  await audit({ ...session, hackathonId: h.id }, "hackathon.created", { type: "hackathons", id: h.id }, { name: h.name, slug: h.slug });
  revalidatePath("/staff/hackathons");

  if (!d.admin_email) return { hackathon: h };
  const invited = await inviteAdmin(session, h.id, d.admin_name, d.admin_email);
  return { hackathon: h, ...invited };
}

export type InviteAdminState = { error?: string; invite?: CreateHackathonState["invite"] };

export async function inviteHackathonAdmin(hackathonId: string, _prev: InviteAdminState, formData: FormData): Promise<InviteAdminState> {
  const session = await requireSuperAdmin();
  if (!UUID.test(hackathonId)) return { error: "Invalid hackathon." };
  const name = str(formData, "admin_name", 120);
  const email = z.string().trim().toLowerCase().email().safeParse(str(formData, "admin_email", 254));
  if (name.length < 2) return { error: "Enter the Admin's name." };
  if (!email.success) return { error: "Enter a valid email." };
  const { data: h } = await createServiceClient().from("hackathons").select("id").eq("id", hackathonId).maybeSingle();
  if (!h) return { error: "Hackathon not found." };
  const res = await inviteAdmin(session, hackathonId, name, email.data);
  revalidatePath(`/staff/hackathons/${hackathonId}`);
  return res;
}

const STATUSES = ["setup", "active", "completed", "archived"] as const;

export async function setHackathonStatus(hackathonId: string, formData: FormData) {
  const session = await requireSuperAdmin();
  const back = `/staff/hackathons/${hackathonId}`;
  if (!UUID.test(hackathonId)) flash("/staff/hackathons", { error: "Invalid hackathon." });
  const status = z.enum(STATUSES).safeParse(formData.get("status"));
  if (!status.success) flash(back, { error: "Invalid status." });
  const { error } = await createServiceClient(session.userId).from("hackathons").update({ status: status.data }).eq("id", hackathonId);
  if (error) flash(back, { error: dbErrorMessage(error) });
  await audit({ ...session, hackathonId }, "hackathon.status_changed", { type: "hackathons", id: hackathonId }, { status: status.data });
  revalidatePath("/staff/hackathons");
  revalidatePath("/");
  flash(back, { notice: `Status set to ${status.data}.` });
}

/** Opens a hackathon for the Super Admin (support / oversight) and goes to its dashboard. */
export async function openHackathon(hackathonId: string) {
  await requireSuperAdmin();
  if (!UUID.test(hackathonId)) flash("/staff/hackathons", { error: "Invalid hackathon." });
  const { data: h } = await createServiceClient().from("hackathons").select("id").eq("id", hackathonId).maybeSingle();
  if (!h) flash("/staff/hackathons", { error: "Hackathon not found." });
  (await cookies()).set(HACKATHON_COOKIE, hackathonId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/staff");
}

/** Back to the platform view. */
export async function closeHackathon() {
  await requireSuperAdmin();
  (await cookies()).delete(HACKATHON_COOKIE);
  redirect("/staff/hackathons");
}
