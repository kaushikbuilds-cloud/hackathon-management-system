"use server";

import { revalidatePath } from "next/cache";
import { bool, dbErrorMessage, flash, str } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { templateConfigSchema } from "@/lib/domain/template";
import { createClient } from "@/lib/supabase/server";

/** Publishes a new immutable template version; generated team PDFs become outdated. */
export async function publishTemplate(formData: FormData) {
  await requireAdmin();
  const parsed = templateConfigSchema.safeParse({
    cardSize: str(formData, "cardSize", 20),
    pageLayout: str(formData, "pageLayout", 20),
    headerColor: str(formData, "headerColor", 7),
    accentColor: str(formData, "accentColor", 7),
    showPhoto: bool(formData, "showPhoto"),
    showCollege: bool(formData, "showCollege"),
    showDepartment: bool(formData, "showDepartment"),
    showEventDate: bool(formData, "showEventDate"),
    showVenue: bool(formData, "showVenue"),
    footerText: str(formData, "footerText", 80),
    additionalInfo: str(formData, "additionalInfo", 120),
  });
  if (!parsed.success) flash("/staff/id-cards", { error: parsed.error.issues[0].message });
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_id_card_template", { p_name: str(formData, "name", 100), p_config: parsed.data });
  if (error) flash("/staff/id-cards", { error: dbErrorMessage(error) });
  revalidatePath("/staff/teams");
  flash("/staff/id-cards", { notice: "New template version published. Previously generated PDFs are now marked Outdated." });
}
