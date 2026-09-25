"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UUID, bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { OPTIONAL_MEMBER_FIELDS, customQuestionSchema, type CustomQuestion, type FieldConfig } from "@/lib/domain/registration";
import { fromLocalInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug may contain lowercase letters, numbers and single hyphens").max(60);

export async function createForm(formData: FormData) {
  await requirePermission("manage_registrations");
  const hackathon = await getHackathon();
  if (!hackathon) flash("/staff/forms", { error: "Configure the event first." });
  const title = str(formData, "title", 150);
  const slug = slugSchema.safeParse(str(formData, "slug", 60));
  if (title.length < 2) flash("/staff/forms/new", { error: "Title is required." });
  if (!slug.success) flash("/staff/forms/new", { error: slug.error.issues[0].message });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_forms")
    .insert({
      hackathon_id: hackathon.id, title, slug: slug.data, status: "draft",
      min_team_size: hackathon.min_team_size, max_team_size: hackathon.max_team_size,
      field_config: { phone: { enabled: true, required: true }, department: { enabled: true, required: true }, academic_year: { enabled: true, required: true }, college: { enabled: false, required: false } },
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) flash("/staff/forms/new", { error: error?.code === "23505" ? "That URL slug is already used." : dbErrorMessage(error) });
  redirect(`/staff/forms/${data.id}?notice=${encodeURIComponent("Form created as a draft. Configure it, then publish.")}`);
}

function parseQuestions(formData: FormData): { questions: CustomQuestion[]; error?: string } {
  const questions: CustomQuestion[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const label = str(formData, `q.${i}.label`, 200);
    if (!label) continue;
    const type = str(formData, `q.${i}.type`, 20) || "text";
    let id = str(formData, `q.${i}.id`, 40) || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || `q${i}`;
    while (used.has(id)) id = `${id}_${i}`;
    used.add(id);
    const options = str(formData, `q.${i}.options`, 3000).split(",").map((o) => o.trim()).filter(Boolean);
    const parsed = customQuestionSchema.safeParse({ id, label, type, options: type === "select" ? options : undefined, required: bool(formData, `q.${i}.required`) });
    if (!parsed.success) return { questions, error: `Question "${label}": ${parsed.error.issues[0].message}` };
    if (type === "select" && options.length < 2) return { questions, error: `Question "${label}" needs at least two comma-separated options.` };
    questions.push(parsed.data);
  }
  return { questions };
}

/** Registration fee settings. Returns an error message, or the columns to save. */
function parseFee(formData: FormData) {
  const enabled = bool(formData, "fee_enabled");
  const amountRaw = str(formData, "fee_amount", 12);
  const amount = amountRaw ? Number(amountRaw) : null;
  const basis = str(formData, "fee_basis", 10) === "member" ? "member" : "team";
  const upi = str(formData, "fee_upi_id", 129).trim();
  const payee = str(formData, "fee_payee_name", 100).trim();
  const instructions = str(formData, "fee_instructions", 1000).trim();
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 100000)) return "Enter a fee between ₹1 and ₹1,00,000.";
  if (upi && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(upi)) return "Enter a valid UPI ID, like name@okaxis.";
  if (enabled && (!amount || !upi)) return "To collect a fee, enter the amount and your UPI ID.";
  return {
    fee_enabled: enabled, fee_amount: amount ? Math.round(amount * 100) / 100 : null, fee_basis: basis,
    fee_upi_id: upi || null, fee_payee_name: payee || null, fee_instructions: instructions || null,
  };
}

export async function updateForm(formId: string, formData: FormData) {
  if (!UUID.test(formId)) throw new Error("Invalid id");
  await requirePermission("manage_registrations");
  const back = `/staff/forms/${formId}`;
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  const title = str(formData, "title", 150);
  const slug = slugSchema.safeParse(str(formData, "slug", 60));
  const min = Number(str(formData, "min_team_size"));
  const max = Number(str(formData, "max_team_size"));
  if (title.length < 2) flash(back, { error: "Title is required." });
  if (!slug.success) flash(back, { error: slug.error.issues[0].message });
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 20 || max < min) flash(back, { error: "Team size must satisfy 1 ≤ min ≤ max ≤ 20." });
  const opensAt = fromLocalInput(str(formData, "opens_at"), tz);
  const closesAt = fromLocalInput(str(formData, "closes_at"), tz);
  if (opensAt && closesAt && closesAt <= opensAt) flash(back, { error: "The closing time must be after the opening time." });

  const fieldConfig = Object.fromEntries(
    OPTIONAL_MEMBER_FIELDS.map((f) => {
      const enabled = bool(formData, `field.${f}.enabled`);
      return [f, { enabled, required: enabled && bool(formData, `field.${f}.required`) }];
    }),
  ) as FieldConfig;
  const { questions, error: qError } = parseQuestions(formData);
  if (qError) flash(back, { error: qError });

  const fee = parseFee(formData);
  if (typeof fee === "string") flash(back, { error: fee });

  const supabase = await createClient();
  const { error } = await supabase
    .from("registration_forms")
    .update({
      title, slug: slug.data, description: str(formData, "description", 5000) || null,
      min_team_size: min, max_team_size: max, requires_approval: bool(formData, "requires_approval"),
      opens_at: opensAt, closes_at: closesAt, field_config: fieldConfig, custom_questions: questions,
      ...fee,
    })
    .eq("id", formId);
  if (error) flash(back, { error: error.code === "23505" ? "That URL slug is already used." : dbErrorMessage(error) });
  revalidatePath("/staff/forms");
  flash(back, { notice: "Form saved." });
}

export async function setFormStatus(formId: string, status: "draft" | "published" | "closed") {
  if (!UUID.test(formId)) throw new Error("Invalid id");
  await requirePermission("manage_registrations");
  const supabase = await createClient();
  const { error } = await supabase.from("registration_forms").update({ status }).eq("id", formId);
  const back = `/staff/forms/${formId}`;
  if (error) flash(back, { error: dbErrorMessage(error) });
  revalidatePath("/");
  flash(back, { notice: status === "published" ? "Form published. Share the public URL." : status === "closed" ? "Form closed. No further submissions are accepted." : "Form unpublished (draft)." });
}
