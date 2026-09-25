"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UUID, bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { FOOD_STATUS_LABEL, isFoodStatus } from "@/lib/domain/food";
import { createClient } from "@/lib/supabase/server";

const BOARD = "/staff/food";
const MENU = "/staff/food/menu";

function done(path: string, notice: string): never {
  revalidatePath(BOARD, "layout");
  revalidatePath("/portal/food");
  flash(path, { notice });
}

const shopSchema = z.object({
  name: z.string().trim().min(1, "Shop name is required").max(80),
  description: z.string().trim().max(300),
  location: z.string().trim().max(120),
});

export async function saveShop(formData: FormData) {
  const session = await requirePermission("manage_food");
  const id = str(formData, "id", 40);
  if (id && !UUID.test(id)) flash(MENU, { error: "Invalid shop." });
  const parsed = shopSchema.safeParse({ name: str(formData, "name", 100), description: str(formData, "description", 400), location: str(formData, "location", 150) });
  if (!parsed.success) flash(MENU, { error: parsed.error.issues[0].message });
  const row = {
    ...parsed.data,
    description: parsed.data.description || null,
    location: parsed.data.location || null,
    is_free: str(formData, "kind") === "free",
    is_open: bool(formData, "is_open"),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("food_shops").update(row).eq("id", id)
    : await supabase.from("food_shops").insert({ ...row, hackathon_id: session.hackathonId });
  if (error?.code === "23505") flash(MENU, { error: "Another shop already has this name." });
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  done(MENU, id ? "Shop saved." : "Shop added. Now add its menu items.");
}

export async function setShopOpen(id: string, open: boolean) {
  await requirePermission("manage_food");
  if (!UUID.test(id)) flash(BOARD, { error: "Invalid shop." });
  const { error } = await (await createClient()).from("food_shops").update({ is_open: open }).eq("id", id);
  if (error) flash(BOARD, { error: dbErrorMessage(error) });
  done(BOARD, open ? "The counter is now taking orders." : "The counter stopped taking new orders.");
}

export async function deleteShop(id: string) {
  await requirePermission("manage_food");
  if (!UUID.test(id)) flash(MENU, { error: "Invalid shop." });
  const { error } = await (await createClient()).from("food_shops").delete().eq("id", id);
  if (error?.code === "23503") flash(MENU, { error: "This shop already has orders, so it cannot be deleted. Close it instead." });
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  done(MENU, "Shop deleted.");
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(80),
  description: z.string().trim().max(200),
  price: z.coerce.number().min(0, "Price cannot be negative").max(100000),
  limit: z.union([z.literal(""), z.coerce.number().int().min(1, "Limit must be 1–50").max(50, "Limit must be 1–50")]),
});

export async function saveItem(formData: FormData) {
  const session = await requirePermission("manage_food");
  const id = str(formData, "id", 40);
  const shopId = str(formData, "shop_id", 40);
  if ((id && !UUID.test(id)) || !UUID.test(shopId)) flash(MENU, { error: "Invalid item." });
  const parsed = itemSchema.safeParse({
    name: str(formData, "name", 100), description: str(formData, "description", 250),
    price: str(formData, "price", 12) || "0", limit: str(formData, "limit_per_person", 4),
  });
  if (!parsed.success) flash(MENU, { error: parsed.error.issues[0].message });
  const d = parsed.data;
  const row = {
    name: d.name, description: d.description || null, price: Math.round(d.price * 100) / 100,
    limit_per_person: d.limit === "" ? null : d.limit, is_veg: str(formData, "diet") !== "nonveg", is_available: bool(formData, "is_available"),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("food_items").update(row).eq("id", id)
    : await supabase.from("food_items").insert({ ...row, shop_id: shopId, hackathon_id: session.hackathonId });
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  done(MENU, id ? "Item saved." : "Item added to the menu.");
}

export async function setItemAvailable(id: string, available: boolean) {
  await requirePermission("manage_food");
  if (!UUID.test(id)) flash(MENU, { error: "Invalid item." });
  const { error } = await (await createClient()).from("food_items").update({ is_available: available }).eq("id", id);
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  done(MENU, available ? "Item is available again." : "Item marked sold out.");
}

export async function deleteItem(id: string) {
  await requirePermission("manage_food");
  if (!UUID.test(id)) flash(MENU, { error: "Invalid item." });
  const { error } = await (await createClient()).from("food_items").delete().eq("id", id);
  if (error) flash(MENU, { error: dbErrorMessage(error) });
  done(MENU, "Item removed from the menu.");
}

export async function setOrderStatus(id: string, status: string, back: string) {
  await requirePermission("manage_food");
  const path = back.startsWith(BOARD) ? back : BOARD;
  if (!UUID.test(id) || !isFoodStatus(status)) flash(path, { error: "Invalid order." });
  const { data, error } = await (await createClient()).rpc("set_food_order_status", { p_order: id, p_status: status });
  if (error) flash(path, { error: dbErrorMessage(error) });
  if (!data) flash(path, { error: "That order has already moved on. The board has been refreshed." });
  done(path, `Order marked ${FOOD_STATUS_LABEL[status as keyof typeof FOOD_STATUS_LABEL].toLowerCase()}.`);
}
