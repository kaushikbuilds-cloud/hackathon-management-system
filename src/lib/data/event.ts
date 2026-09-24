import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { publicUrl, BUCKETS } from "@/lib/storage";
import type { Hackathon, RegistrationForm } from "@/lib/types";

/** The single hackathon row (readable by everyone). */
export const getHackathon = cache(async (): Promise<Hackathon | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("hackathons").select("*").limit(1).maybeSingle<Hackathon>();
  return data ?? null;
});

export function brandingUrls(h: Hackathon | null) {
  return {
    logo: h ? publicUrl(BUCKETS.branding, h.logo_path) : null,
    organizerLogo: h ? publicUrl(BUCKETS.branding, h.organizer_logo_path) : null,
  };
}

export type FormAvailability = { open: boolean; reason?: string };

export function formAvailability(form: Pick<RegistrationForm, "status" | "opens_at" | "closes_at">, now = new Date()): FormAvailability {
  if (form.status === "draft") return { open: false, reason: "This registration form has not been published yet." };
  if (form.status === "closed") return { open: false, reason: "Registration is closed." };
  if (form.opens_at && now < new Date(form.opens_at)) return { open: false, reason: "Registration has not opened yet." };
  if (form.closes_at && now > new Date(form.closes_at)) return { open: false, reason: "The registration deadline has passed." };
  return { open: true };
}
