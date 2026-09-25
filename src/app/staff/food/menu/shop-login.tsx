"use client";

import { useActionState } from "react";
import { CopyButton, SubmitButton } from "@/components/client";
import { Alert } from "@/components/ui";
import { issueShopLoginAction, type ShopLoginState } from "../actions";

/** Creates the shop's login or a new temporary password, shown once to hand over. */
export function ShopLoginButton({ shopId, hasLogin }: { shopId: string; hasLogin: boolean }) {
  const [state, action] = useActionState<ShopLoginState, FormData>(issueShopLoginAction.bind(null, shopId), {});
  return (
    <div className="space-y-2">
      <form action={action}>
        <SubmitButton size="sm" variant={hasLogin ? "secondary" : "primary"} pendingText="Working…">{hasLogin ? "New password" : "Create shop login"}</SubmitButton>
      </form>
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.password && (
        <Alert tone="green" title="Give these to the shop now">
          <span className="block">Sign in at the site with <strong>Shop ID</strong> <span className="font-mono font-bold">{state.code}</span> and temporary password:</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-bold">{state.password}</span>
            <CopyButton value={`Shop ID: ${state.code}\nPassword: ${state.password}`} label="Copy both" />
          </span>
          <span className="mt-1 block text-xs">Shown only once. The shop chooses its own password at first sign-in (within 7 days).</span>
        </Alert>
      )}
    </div>
  );
}
