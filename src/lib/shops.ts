import "server-only";
import { recordCredentialEvent } from "@/lib/accounts";
import type { Session } from "@/lib/auth";
import { SHOP_CODE_PATTERN, normalizeIdInput } from "@/lib/domain/ids";
import { createServiceClient } from "@/lib/supabase/server";

/** The sign-in address behind a shop login (never shown or mailed). */
export function shopLoginEmail(shopId: string): string {
  return `shop-${shopId}@shops.hackathonbase.app`;
}

/** Shop ID typed into the sign-in box → that shop login's sign-in address. */
export async function emailForShopCode(value: string): Promise<string | null> {
  const code = normalizeIdInput(value);
  if (!SHOP_CODE_PATTERN.test(code)) return null;
  const service = createServiceClient();
  const { data: shop } = await service.from("food_shops").select("id").eq("code", code).maybeSingle<{ id: string }>();
  if (!shop) return null;
  const { data: account } = await service.from("profiles").select("email").eq("shop_id", shop.id).maybeSingle<{ email: string }>();
  return account?.email ?? null;
}

/** Hours after the hackathon's end that shop logins keep working (settling up). */
export const SHOP_LOGIN_GRACE_HOURS = 24;

/** When a shop login stops working: a day after the hackathon ends (null while no end date is set). */
export function shopLoginEndsAt(hackathonEndsAt: string | null | undefined): Date | null {
  return hackathonEndsAt ? new Date(new Date(hackathonEndsAt).getTime() + SHOP_LOGIN_GRACE_HOURS * 3600_000) : null;
}

/**
 * Creates the shop's login with the password the organisers chose, or sets a
 * new one. The shop uses it as-is (no forced change) until the hackathon ends.
 */
export async function issueShopLogin(actor: Session, shop: { id: string; name: string }, password: string): Promise<void> {
  const service = createServiceClient(actor.userId);
  const { data: existing } = await service.from("profiles").select("id").eq("shop_id", shop.id).maybeSingle<{ id: string }>();
  let profileId = existing?.id;
  if (profileId) {
    const { error } = await service.auth.admin.updateUserById(profileId, { password });
    if (error) throw new Error("Could not change the shop password.");
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email: shopLoginEmail(shop.id), password, email_confirm: true,
      app_metadata: { role: "vendor" }, user_metadata: { full_name: shop.name },
    });
    if (error || !data.user) throw new Error("Could not create the shop login.");
    profileId = data.user.id;
  }
  const { error: linkError } = await service.from("profiles")
    .update({ role: "vendor", shop_id: shop.id, full_name: shop.name, status: "active", must_change_password: false, temp_password_expires_at: null })
    .eq("id", profileId);
  if (linkError) {
    if (!existing) await service.auth.admin.deleteUser(profileId);
    throw new Error("Could not link the login to the shop.");
  }
  await recordCredentialEvent(actor, "temp_password_issued", { profileId }, `Shop login password set for ${shop.name}`);
}
