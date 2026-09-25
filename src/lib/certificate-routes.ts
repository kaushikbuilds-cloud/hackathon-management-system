import "server-only";
import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/api";
import { certificateEvent, type CertificateSettings } from "@/lib/certificates";
import { createServiceClient } from "@/lib/supabase/server";
import type { Hackathon } from "@/lib/types";

export async function loadCertificateHackathon(hackathonId: string) {
  const { data } = await createServiceClient().from("hackathons").select("*").eq("id", hackathonId).maybeSingle<Hackathon & CertificateSettings>();
  return data;
}

export async function eventFor(hackathonId: string) {
  const h = await loadCertificateHackathon(hackathonId);
  return h ? { h, ev: await certificateEvent(h) } : null;
}

export function fileResponse(bytes: Uint8Array, type: string, name: string, inline = false) {
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": type, "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", name), "Cache-Control": "no-store" },
  });
}
