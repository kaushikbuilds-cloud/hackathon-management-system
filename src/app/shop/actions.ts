"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { requireVendor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MENU = "/shop/menu";

function refresh() {
  revalidatePath("/shop", "layout");
  revalidatePath("/portal/food", "layout");
  revalidatePath("/staff/food", "layout");
}

export async function setMyShopOpen(open: boolean) {
  await requireVendor();
  const { error } = await (await createClient()).rpc("set_my_shop_open", { p_open: open });
  if (error) flash("/shop", { error: dbErrorMessage(error) });
  refresh();
  flash("/shop", { notice: open ? "Your shop is open: teams can order now." : "Your shop is closed to new orders." });
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(80),
  description: z.string().trim().max(200),
  price: z.coerce.number().min(0, "Price cannot be negative").max(100000),
});

/** Add or edit an item of this shop's own menu (the database only allows its own shop). */
export async function saveMyItem(formData: FormData) {
  const session = await requireVendor();
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(MENU, { error: "Invalid item." });
  const parsed = itemSchema.safeParse({ name: str(formData, "name", 100), description: str(formData, "description", 250), price: str(formData, "price", 12) || "0" });
  if (!parsed.success) flash(MENU, { error: parsed.error.issues[0].message });
  const row = {
    name: parsed.data.name, description: parsed.data.description || null, price: Math.round(parsed.data.price * 100) / 100,
    is_veg: str(formData, "diet") !== "nonveg", is_available: bool(formData, "is_available"),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("food_items").update(row).eq("id", id).eq("shop_id", session.shopId)
    : await supabase.from("food_items").insert({ ...row, shop_id: session.shopId, hackathon_id: session.hackathonId });
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  refresh();
  flash(MENU, { notice: id ? "Item saved." : "Item added to your menu." });
}

export async function setMyItemAvailable(id: string, available: boolean) {
  const session = await requireVendor();
  if (!UUID.test(id)) flash(MENU, { error: "Invalid item." });
  const { error } = await (await createClient()).from("food_items").update({ is_available: available }).eq("id", id).eq("shop_id", session.shopId);
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  refresh();
  flash(MENU, { notice: available ? "Back in stock." : "Marked sold out." });
}

export async function deleteMyItem(id: string) {
  const session = await requireVendor();
  if (!UUID.test(id)) flash(MENU, { error: "Invalid item." });
  const { error } = await (await createClient()).from("food_items").delete().eq("id", id).eq("shop_id", session.shopId);
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  refresh();
  flash(MENU, { notice: "Item removed from your menu." });
}
