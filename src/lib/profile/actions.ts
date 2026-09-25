"use server";

import { revalidatePath } from "next/cache";
import { flash, str } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Users may edit only their own name and phone (column grants + RLS enforce this). */
export async function updateOwnProfile(formData: FormData) {
  const session = await requireSession();
  const back = session.profile.role === "participant" ? "/portal/profile" : session.profile.role === "vendor" ? "/shop/profile" : "/staff/settings";
  const fullName = str(formData, "full_name", 100).replace(/\s+/g, " ");
  const phone = str(formData, "phone", 20);
  if (fullName.length < 2) flash(back, { error: "Enter your name." });
  if (phone && !/^\+?[0-9][0-9 ()-]{6,19}$/.test(phone)) flash(back, { error: "Invalid phone number." });
  const { error } = await (await createClient()).from("profiles").update({ full_name: fullName, phone: phone || null }).eq("id", session.userId);
  if (error) flash(back, { error: "Could not save your profile." });
  revalidatePath(back);
  flash(back, { notice: "Profile saved." });
}
