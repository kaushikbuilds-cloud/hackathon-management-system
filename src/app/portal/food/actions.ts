"use server";

import { revalidatePath } from "next/cache";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { requireParticipant } from "@/lib/auth";
import { cartFromForm, orderLabel } from "@/lib/domain/food";
import { createClient } from "@/lib/supabase/server";

const PATH = "/portal/food";

type PlaceResult = { ok: true; order_no: number } | { ok: false; code: string; message: string };

export async function placeFoodOrder(shopId: string, formData: FormData) {
  const session = await requireParticipant();
  if (!UUID.test(shopId)) flash(PATH, { error: "Invalid shop." });
  const back = `${PATH}/${shopId}`;
  // The team login says who the order is for; older per-member accounts order for themselves.
  const member = str(formData, "member", 40) || session.participantId || "";
  if (!UUID.test(member)) flash(back, { error: "Choose which team member this order is for." });
  const supabase = await createClient();
  const { data: items } = await supabase.from("food_items").select("id").eq("shop_id", shopId);
  const cart = cartFromForm(formData, new Set((items ?? []).map((i) => i.id as string)));
  if (!cart.length) flash(back, { error: "Choose at least one item." });
  const { data, error } = await supabase.rpc("place_food_order", { p_shop: shopId, p_items: cart, p_note: str(formData, "note", 200) || null, p_member: member });
  if (error || !data) flash(back, { error: dbErrorMessage(error, "Your order could not be placed. Please try again.") });
  const result = data as PlaceResult;
  if (!result.ok) flash(back, { error: result.message });
  revalidatePath(PATH, "layout");
  revalidatePath("/staff/food");
  revalidatePath("/shop");
  flash(PATH, { notice: `Order ${orderLabel(result.order_no)} sent to the shop. You will see here when they accept it and when it is ready.` });
}

export async function cancelFoodOrder(orderId: string) {
  await requireParticipant();
  if (!UUID.test(orderId)) flash(PATH, { error: "Invalid order." });
  const { data, error } = await (await createClient()).rpc("cancel_food_order", { p_order: orderId });
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  if (!data) flash(PATH, { error: "The shop has already accepted this order, so it can no longer be cancelled here. Please ask at the counter." });
  revalidatePath(PATH, "layout");
  revalidatePath("/staff/food");
  revalidatePath("/shop");
  flash(PATH, { notice: "Order cancelled." });
}
