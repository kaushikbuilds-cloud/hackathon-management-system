"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { fromLocalInput, isValidTimeZone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type EventFormState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };

const optionalEmail = z.union([z.literal(""), z.string().email("Invalid email").max(254)]);

const schema = z
  .object({
    name: z.string().min(2, "Name is required").max(120),
    tagline: z.string().max(200),
    description: z.string().max(5000),
    organizer_name: z.string().max(150),
    venue: z.string().max(200),
    timezone: z.string().refine(isValidTimeZone, "Unknown time zone (use an IANA name like Asia/Kolkata)"),
    contact_email: optionalEmail,
    contact_phone: z.string().max(30),
    support_instructions: z.string().max(2000),
    min_team_size: z.coerce.number().int().min(1).max(20),
    max_team_size: z.coerce.number().int().min(1).max(20),
    code_prefix: z.string().transform((v) => v.trim().toUpperCase()).refine((v) => v === "" || /^[A-Z0-9]{2,10}$/.test(v), "Use 2–10 letters or digits, no spaces"),
  })
  .refine((d) => d.max_team_size >= d.min_team_size, { path: ["max_team_size"], message: "Must be ≥ minimum size" });

export async function saveEvent(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const session = await requirePermission("manage_event");
  const raw = Object.fromEntries(
    ["name", "tagline", "description", "organizer_name", "venue", "timezone", "contact_email", "contact_phone", "support_instructions", "min_team_size", "max_team_size", "code_prefix"].map((k) => [k, str(formData, k, 5000)]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  const tz = d.timezone;
  const dates = {
    starts_at: fromLocalInput(str(formData, "starts_at"), tz),
    ends_at: fromLocalInput(str(formData, "ends_at"), tz),
    registration_opens_at: fromLocalInput(str(formData, "registration_opens_at"), tz),
    registration_closes_at: fromLocalInput(str(formData, "registration_closes_at"), tz),
  };
  if (dates.starts_at && dates.ends_at && dates.ends_at < dates.starts_at) return { error: "The event must end after it starts.", fieldErrors: { ends_at: "End must be after start" } };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("hackathons").select("*").eq("id", session.hackathonId).maybeSingle<{ id: string; code_prefix?: string }>();
  if (!existing) return { error: "Hackathon not found." };
  const { code_prefix, ...rest } = d;
  const prefixChanged = existing.code_prefix !== undefined && code_prefix !== "" && code_prefix !== existing.code_prefix;
  if (prefixChanged) {
    const { count: teamCount } = await supabase.from("teams").select("id", { count: "exact", head: true });
    if ((teamCount ?? 0) > 0) {
      return { error: "The ID prefix cannot change after teams have registered (IDs are permanent).", fieldErrors: { code_prefix: "Locked" } };
    }
  }

  const update: Record<string, unknown> = {
    ...rest,
    ...(prefixChanged ? { code_prefix } : {}),
    tagline: d.tagline || null, description: d.description || null, organizer_name: d.organizer_name || null, venue: d.venue || null,
    contact_email: d.contact_email || null, contact_phone: d.contact_phone || null, support_instructions: d.support_instructions || null,
    portal_id_cards: formData.get("portal_id_cards") === "on",
    ...dates,
  };

  const { error } = await supabase.from("hackathons").update(update).eq("id", existing.id);
  if (error?.code === "23505" && prefixChanged) return { error: "Please fix the highlighted fields.", fieldErrors: { code_prefix: "Another hackathon already uses this prefix" } };
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Event settings saved. Generated ID card PDFs were marked outdated if card details changed." };
}
