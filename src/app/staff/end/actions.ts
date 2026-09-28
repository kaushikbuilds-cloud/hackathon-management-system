"use server";

import { revalidatePath } from "next/cache";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission, requireSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storeHackathonExport } from "@/lib/export";
import { createClient } from "@/lib/supabase/server";

const PATH = "/staff/end";

export async function endHackathon(formData: FormData) {
  const session = await requirePermission("manage_event");
  if (str(formData, "confirm", 20).toUpperCase() !== "END") flash(PATH, { error: "Type END in the box to confirm." });
  const { data, error } = await (await createClient()).rpc("end_hackathon");
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  if (!data) flash(PATH, { error: "This hackathon has already ended." });
  await audit(session, "hackathon.ended", { type: "hackathons", id: session.hackathonId });
  revalidatePath("/", "layout");
  flash(PATH, { notice: "The hackathon has ended. Download the full data below; teams can now download their certificates." });
}

export async function reopenHackathon(hackathonId: string) {
  const session = await requireSuperAdmin();
  if (!UUID.test(hackathonId)) flash(PATH, { error: "Invalid hackathon." });
  const { data, error } = await (await createClient()).rpc("reopen_hackathon", { p_hackathon: hackathonId });
  if (error || !data) flash(PATH, { error: dbErrorMessage(error, "Could not reopen the hackathon.") });
  await audit(session, "hackathon.reopened", { type: "hackathons", id: hackathonId });
  revalidatePath("/", "layout");
  flash(PATH, { notice: "Hackathon reopened. Registration forms and food shops stay closed until you open them again." });
}

/** Builds the full data download (spreadsheets, files, certificates) and stores it for an hour-long link. */
export async function prepareFullExport() {
  const session = await requirePermission("manage_event");
  let parts = 0;
  try {
    const stored = await storeHackathonExport(session.hackathonId);
    parts = stored.parts.length;
    await audit(session, "report.exported", { type: "report", id: "full_export" }, { parts, bytes: stored.parts.reduce((a, p) => a + p.size, 0) });
  } catch (e) {
    console.error("export failed", e instanceof Error ? e.message : e);
    flash(PATH, { error: "The export could not be prepared. Please try again." });
  }
  revalidatePath(PATH);
  flash(PATH, { notice: parts > 1 ? `Full data ready in ${parts} parts. Download each part below.` : "Full data ready. Download it below." });
}
