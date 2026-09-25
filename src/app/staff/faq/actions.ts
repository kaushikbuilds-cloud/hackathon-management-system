"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PATH = "/staff/faq";

const schema = z.object({
  question: z.string().trim().min(3, "Write the question (at least 3 characters).").max(200),
  answer: z.string().trim().min(1, "Write the answer.").max(3000),
  category: z.string().trim().max(40),
  audience: z.enum(["public", "participants"]),
  sort_order: z.coerce.number().int().min(0).max(9999),
});

function done(notice: string): never {
  revalidatePath(PATH);
  revalidatePath("/h", "layout");
  revalidatePath("/portal/support");
  flash(PATH, { notice });
}

export async function saveFaq(formData: FormData) {
  const session = await requirePermission("publish_announcements");
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(PATH, { error: "Invalid question." });
  const parsed = schema.safeParse({
    question: str(formData, "question", 250), answer: str(formData, "answer", 3500), category: str(formData, "category", 60),
    audience: str(formData, "audience") || "public", sort_order: str(formData, "sort_order", 6) || "0",
  });
  if (!parsed.success) flash(PATH, { error: parsed.error.issues[0].message });
  const row = { ...parsed.data, category: parsed.data.category || null, is_published: bool(formData, "is_published"), updated_at: new Date().toISOString() };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("hackathon_faqs").update(row).eq("id", id)
    : await supabase.from("hackathon_faqs").insert({ ...row, hackathon_id: session.hackathonId });
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  done(id ? "Answer saved." : "Question added.");
}

export async function deleteFaq(id: string) {
  await requirePermission("publish_announcements");
  if (!UUID.test(id)) flash(PATH, { error: "Invalid question." });
  const { error } = await (await createClient()).from("hackathon_faqs").delete().eq("id", id);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  done("Question deleted.");
}

/** One click to add the questions every hackathon gets asked; the host edits the answers. */
export async function addStarterFaqs() {
  const session = await requirePermission("publish_announcements");
  const starters: [string, string, string, "public" | "participants"][] = [
    ["Who can take part?", "Students from any college can register as a team. Check the team size on the registration form.", "Registration", "public"],
    ["Is there a registration fee?", "If there is a fee, the registration form shows the amount and a UPI QR code. The organisers verify each payment.", "Registration", "public"],
    ["How do we sign in to the team portal?", "Every member's ID card shows the Team ID and a one-time team login code. One member activates the login at /activate and shares the password with the team.", "Portal", "participants"],
    ["We forgot our team password.", "Ask the organisers at the help desk. They will issue a new code on reprinted ID cards, and you can set a new password with it.", "Portal", "participants"],
    ["How does food work?", "Open Food in the team portal when a counter is open, choose who the order is for, and collect it when it shows Ready. Paid counters take payment when you collect.", "Food", "participants"],
    ["What should we bring?", "Your ID card, college ID, laptop and charger. Wear the ID card at all times.", "On the day", "public"],
  ];
  const rows = starters.map(([question, answer, category, audience], i) => ({
    hackathon_id: session.hackathonId, question, answer, category, audience, is_published: false, sort_order: (i + 1) * 10,
  }));
  const { error } = await (await createClient()).from("hackathon_faqs").insert(rows);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  done("Starter questions added as drafts. Edit the answers, then publish them.");
}
