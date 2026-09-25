import "server-only";
import { recordCredentialEvent } from "@/lib/accounts";
import type { Session } from "@/lib/auth";
import { SHOP_CODE_PATTERN, normalizeIdInput } from "@/lib/domain/ids";
import { generateTemporaryPassword } from "@/lib/domain/password";
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

const TEMP_DAYS = 7;

/**
 * Creates the shop's login, or gives it a new password. Returns a temporary
 * password to hand to the shop once; they must choose their own at first sign-in.
 */
export async function issueShopLogin(actor: Session, shop: { id: string; name: string }): Promise<string> {
  const service = createServiceClient(actor.userId);
  const password = generateTemporaryPassword();
  const expires = new Date(Date.now() + TEMP_DAYS * 86400_000).toISOString();
  const { data: existing } = await service.from("profiles").select("id").eq("shop_id", shop.id).maybeSingle<{ id: string }>();
  let profileId = existing?.id;
  if (profileId) {
    const { error } = await service.auth.admin.updateUserById(profileId, { password });
    if (error) throw new Error("Could not reset the shop password.");
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email: shopLoginEmail(shop.id), password, email_confirm: true,
      app_metadata: { role: "vendor" }, user_metadata: { full_name: shop.name },
    });
    if (error || !data.user) throw new Error("Could not create the shop login.");
    profileId = data.user.id;
  }
  const { error: linkError } = await service.from("profiles")
    .update({ role: "vendor", shop_id: shop.id, full_name: shop.name, status: "active", must_change_password: true, temp_password_expires_at: expires })
    .eq("id", profileId);
  if (linkError) {
    if (!existing) await service.auth.admin.deleteUser(profileId);
    throw new Error("Could not link the login to the shop.");
  }
  await recordCredentialEvent(actor, "temp_password_issued", { profileId }, `Shop login for ${shop.name}`);
  return password;
}
