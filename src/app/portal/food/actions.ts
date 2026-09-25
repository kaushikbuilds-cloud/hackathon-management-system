"use server";

import { revalidatePath } from "next/cache";
import { UUID, dbErrorMessage, flash, str } from "@/lib/actions";
import { requireParticipant } from "@/lib/auth";
import { cartFromForm, orderLabel } from "@/lib/domain/food";
import { createClient } from "@/lib/supabase/server";

const PATH = "/portal/food";

type PlaceResult = { ok: true; order_no: number } | { ok: false; code: string; message: string };

export async function placeFoodOrder(shopId: string, formData: FormData) {
  await requireParticipant();
  if (!UUID.test(shopId)) flash(PATH, { error: "Invalid shop." });
  const supabase = await createClient();
  const { data: items } = await supabase.from("food_items").select("id").eq("shop_id", shopId);
  const cart = cartFromForm(formData, new Set((items ?? []).map((i) => i.id as string)));
  if (!cart.length) flash(PATH, { error: "Choose at least one item." });
  const { data, error } = await supabase.rpc("place_food_order", { p_shop: shopId, p_items: cart, p_note: str(formData, "note", 200) || null });
  if (error || !data) flash(PATH, { error: dbErrorMessage(error, "Your order could not be placed. Please try again.") });
  const result = data as PlaceResult;
  if (!result.ok) flash(PATH, { error: result.message });
  revalidatePath(PATH);
  revalidatePath("/staff/food");
  flash(PATH, { notice: `Order ${orderLabel(result.order_no)} placed. Watch its status below and collect it when it says Ready.` });
}

export async function cancelFoodOrder(orderId: string) {
  await requireParticipant();
  if (!UUID.test(orderId)) flash(PATH, { error: "Invalid order." });
  const { data, error } = await (await createClient()).rpc("cancel_food_order", { p_order: orderId });
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  if (!data) flash(PATH, { error: "This order is already being prepared, so it can no longer be cancelled here. Please ask at the counter." });
  revalidatePath(PATH);
  revalidatePath("/staff/food");
  flash(PATH, { notice: "Order cancelled." });
}
