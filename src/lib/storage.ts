import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { settings } from "@/lib/env";

export const BUCKETS = {
  branding: "branding",
  photos: "participant-photos",
  idCards: "id-cards",
  attachments: "support-attachments",
  paymentProofs: "payment-proofs",
} as const;

type AllowedType = "image/png" | "image/jpeg" | "application/pdf" | "text/plain";

/** Detects the real content type from magic bytes (never trust the browser). */
export function sniffContentType(bytes: Uint8Array): AllowedType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  // Plain text: valid UTF-8 without NUL bytes.
  if (bytes.length > 0 && !bytes.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 4096));
      return "text/plain";
    } catch {
      return null;
    }
  }
  return null;
}

const EXTENSION: Record<AllowedType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

export type UploadCheck = { ok: true; bytes: Uint8Array; contentType: AllowedType; extension: string } | { ok: false; error: string };

/** Validates an uploaded File by size and sniffed content type. */
export async function validateUpload(file: File, allowed: AllowedType[], maxBytes: number): Promise<UploadCheck> {
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > maxBytes) return { ok: false, error: `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffContentType(bytes);
  if (!contentType || !allowed.includes(contentType)) {
    return { ok: false, error: `Unsupported file type. Allowed: ${allowed.map((t) => EXTENSION[t].toUpperCase()).join(", ")}.` };
  }
  return { ok: true, bytes, contentType, extension: EXTENSION[contentType] };
}

export async function uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await createServiceClient().storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function downloadObject(bucket: string, path: string | null | undefined): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await createServiceClient().storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function signedUrl(bucket: string, path: string, downloadName?: string): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .storage.from(bucket)
    .createSignedUrl(path, settings.signedUrlSeconds, downloadName ? { download: downloadName } : undefined);
  return error ? null : data.signedUrl;
}

export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return createServiceClient().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
