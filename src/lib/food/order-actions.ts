"use server";

import { revalidatePath } from "next/cache";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { can, requireSession } from "@/lib/auth";
import { FOOD_STATUS_LABEL, isFoodStatus } from "@/lib/domain/food";
import { createClient } from "@/lib/supabase/server";

const BOARDS = ["/staff/food", "/shop"];

/**
 * Moves an order along (accept, reject with a reason, ready, collected,
 * cancel). Used by food staff and by a shop's own login; the database checks
 * the order belongs to them and the step is allowed.
 */
export async function updateFoodOrder(orderId: string, status: string, back: string, formData: FormData) {
  const session = await requireSession();
  const path = BOARDS.some((b) => back === b || back.startsWith(`${b}?`)) ? back : session.profile.role === "vendor" ? "/shop" : "/staff/food";
  if (session.profile.role !== "vendor" && !can(session, "manage_food")) flash(path, { error: "You do not have access to food orders." });
  if (!UUID.test(orderId) || !isFoodStatus(status)) flash(path, { error: "Invalid order." });
  const reason = str(formData, "reason", 200);
  if (status === "rejected" && reason.length < 3) flash(path, { error: "Write a short reason so the team knows why (e.g. Sold out)." });
  const { data, error } = await (await createClient()).rpc("set_food_order_status", { p_order: orderId, p_status: status, p_reason: reason || null });
  if (error) flash(path, { error: dbErrorMessage(error) });
  if (!data) flash(path, { error: "That order has already moved on. The board has been refreshed." });
  for (const b of BOARDS) revalidatePath(b, "layout");
  revalidatePath("/portal/food", "layout");
  flash(path, { notice: `Order marked ${FOOD_STATUS_LABEL[status as keyof typeof FOOD_STATUS_LABEL].toLowerCase()}.` });
}
