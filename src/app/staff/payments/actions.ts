"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, flash, str } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const PATH = "/staff/payments";

/** The Super Admin sets the price of one hackathon (in rupees). */
export async function saveHackathonPrice(formData: FormData) {
  const session = await requireSuperAdmin();
  const rupees = Number(str(formData, "price", 12).replace(/[, ]/g, ""));
  if (!Number.isFinite(rupees) || rupees < 1 || rupees > 1000000) flash(PATH, { error: "Enter a price between ₹1 and ₹10,00,000." });
  const paise = Math.round(rupees * 100);
  const { error } = await createServiceClient(session.userId).from("platform_settings")
    .update({ hackathon_price_paise: paise, updated_at: new Date().toISOString(), updated_by: session.userId }).eq("id", true);
  if (error) flash(PATH, { error: dbErrorMessage(error) });
  await audit(session, "billing.price_changed", { type: "platform_settings", id: null }, { paise });
  revalidatePath(PATH);
  revalidatePath("/start");
  revalidatePath("/");
  flash(PATH, { notice: "Price saved. New sign-ups pay the new price." });
}
