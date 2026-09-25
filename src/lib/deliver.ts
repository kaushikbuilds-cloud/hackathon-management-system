import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/api";
import { BUCKETS, uploadObject } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/server";

/** Vercel functions cannot return bodies over ~4.5 MB; stay well under it. */
const DIRECT_LIMIT = 4 * 1024 * 1024;
const LINK_SECONDS = 3600;

/** A private, short-lived download link for a stored export. */
export async function exportLink(path: string, fileName: string): Promise<string | null> {
  const { data, error } = await createServiceClient().storage.from(BUCKETS.exports).createSignedUrl(path, LINK_SECONDS, { download: fileName });
  return error ? null : data.signedUrl;
}

/**
 * Sends a generated file: small ones directly, large ones via private storage
 * and a one-hour download link (the browser follows the redirect).
 */
export async function deliverFile(bytes: Uint8Array, opts: { name: string; type: string; hackathonId: string; inline?: boolean }) {
  if (bytes.length <= DIRECT_LIMIT) {
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": opts.type, "Content-Disposition": contentDisposition(opts.inline ? "inline" : "attachment", opts.name), "Cache-Control": "no-store" },
    });
  }
  const path = `${opts.hackathonId}/downloads/${randomUUID()}/${opts.name}`;
  await uploadObject(BUCKETS.exports, path, bytes, opts.type);
  const url = await exportLink(path, opts.name);
  if (!url) return NextResponse.json({ error: "The file was prepared but could not be linked. Try again." }, { status: 500 });
  return NextResponse.redirect(url, { status: 303 });
}
