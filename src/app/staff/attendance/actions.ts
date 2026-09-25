"use server";

import { revalidatePath } from "next/cache";
import { UUID } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { extractQrToken } from "@/lib/domain/ids";
import { createClient } from "@/lib/supabase/server";

export type VerifyResult = {
  state: "invalid" | "revoked" | "already_checked_in" | "valid" | "ended";
  participant?: { id: string; participant_code: string; full_name: string; role: string; college: string | null; department: string | null };
  team?: { id: string; team_code: string; name: string; status: string };
  checked_in_at?: string | null;
};

export type CheckInResult = { ok: boolean; code?: string; message?: string; checked_in_at?: string; full_name?: string; participant_code?: string };

const ENDED = "This hackathon has ended, so ID cards can no longer be used to check in.";

/** ID cards stop working once the hackathon has ended (the database refuses check-ins too). */
async function hackathonEnded(hackathonId: string): Promise<boolean> {
  const { data } = await (await createClient()).from("hackathons").select("status").eq("id", hackathonId).maybeSingle<{ status: string }>();
  return data?.status === "completed";
}

/** Resolves a scanned QR payload server-side. Scanning alone never records attendance. */
export async function verifyScan(scanned: string): Promise<VerifyResult> {
  const session = await requirePermission("record_attendance", "manual_checkin");
  const token = extractQrToken(String(scanned ?? "").slice(0, 500));
  if (!token) return { state: "invalid" };
  if (await hackathonEnded(session.hackathonId)) return { state: "ended" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_qr", { p_token: token });
  if (error || !data) return { state: "invalid" };
  return data as VerifyResult;
}

/** Explicit, confirmed check-in (QR or manual). Duplicate check-ins are rejected by a DB constraint. */
export async function confirmCheckIn(participantId: string, method: "qr" | "manual"): Promise<CheckInResult> {
  if (!UUID.test(participantId) || !["qr", "manual"].includes(method)) return { ok: false, message: "Invalid request." };
  const session = await requirePermission(method === "qr" ? "record_attendance" : "manual_checkin");
  if (await hackathonEnded(session.hackathonId)) return { ok: false, code: "ended", message: ENDED };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in", { p_participant_id: participantId, p_method: method });
  if (error || !data) return { ok: false, message: "Check-in failed. Please retry." };
  revalidatePath("/staff/attendance", "layout");
  return data as CheckInResult;
}

export async function undoCheckIn(attendanceId: string, reason: string): Promise<CheckInResult> {
  const session = await requirePermission("correct_attendance");
  if (!UUID.test(attendanceId)) return { ok: false, message: "Invalid request." };
  if (await hackathonEnded(session.hackathonId)) return { ok: false, code: "ended", message: ENDED };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_check_in", { p_attendance_id: attendanceId, p_reason: String(reason ?? "").slice(0, 500) });
  if (error || !data) return { ok: false, message: "Correction failed." };
  revalidatePath("/staff/attendance", "layout");
  return data as CheckInResult;
}
