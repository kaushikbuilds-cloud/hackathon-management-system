"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage } from "@/lib/actions";
import { requirePermission } from "@/lib/auth";
import { BUCKETS, uploadObject, validateUpload } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export type BrandState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2f3fe0");

/** Saves the hackathon's brand kit: logos and the two brand colours used on ID cards and public pages. */
export async function saveBrandKit(_prev: BrandState, formData: FormData): Promise<BrandState> {
  const session = await requirePermission("manage_event");
  const colours = z.object({ primary_color: hex, accent_color: hex }).safeParse({
    primary_color: String(formData.get("primary_color") ?? "").toLowerCase(),
    accent_color: String(formData.get("accent_color") ?? "").toLowerCase(),
  });
  if (!colours.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of colours.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const update: Record<string, unknown> = { ...colours.data };

  for (const [field, column] of [["logo", "logo_path"], ["organizer_logo", "organizer_logo_path"]] as const) {
    const file = formData.get(field);
    if (file instanceof File && file.size > 0) {
      const check = await validateUpload(file, ["image/png", "image/jpeg"], 2 * 1024 * 1024);
      if (!check.ok) return { error: check.error, fieldErrors: { [field]: check.error } };
      const path = `${session.hackathonId}/${field}-${Date.now()}.${check.extension}`;
      await uploadObject(BUCKETS.branding, path, check.bytes, check.contentType);
      update[column] = path;
    }
    if (formData.get(`remove_${field}`) === "on") update[column] = null;
  }

  const { error } = await (await createClient()).from("hackathons").update(update).eq("id", session.hackathonId);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Brand kit saved. ID cards generated earlier were marked outdated; regenerate them to use the new look." };
}
