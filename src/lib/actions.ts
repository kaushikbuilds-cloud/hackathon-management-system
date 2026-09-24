import "server-only";
import { redirect } from "next/navigation";

/** Redirects back to `path` with a flash message (rendered by <Flash/>). */
export function flash(path: string, message: { notice?: string; error?: string }): never {
  const url = new URL(path, "http://local");
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  if (message.notice) url.searchParams.set("notice", message.notice);
  if (message.error) url.searchParams.set("error", message.error);
  redirect(url.pathname + url.search);
}

type PgError = { code?: string; message?: string; details?: string } | null | undefined;

/** User-friendly text for common Postgres/PostgREST errors (never leaks SQL). */
export function dbErrorMessage(error: PgError, fallback = "The change could not be saved."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "23505":
      if (error.message?.includes("teams_name_key_unique")) return "Another team already uses this name.";
      if (error.message?.includes("participants_email_unique")) return "This email is already registered in the event.";
      if (error.message?.includes("participants_one_leader_per_team")) return "The team already has a leader.";
      return "A record with these details already exists.";
    case "23514":
    case "22P02":
      return error.message?.includes("immutable") ? "Identifiers cannot be changed." : "Some values are invalid.";
    case "42501":
      return "You do not have permission to do that.";
    case "P0001":
      return error.message ?? fallback;
    default:
      return fallback;
  }
}

export function str(formData: FormData, key: string, max = 1000): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function bool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
