"use client";

import { useActionState } from "react";
import { CopyButton, SubmitButton } from "@/components/client";
import { Alert, TextField } from "@/components/ui";
import { issueShopLoginAction, type ShopLoginState } from "../actions";

/** The organisers choose the shop's password (a suggestion is filled in); it works until the hackathon ends. */
export function ShopLoginForm({ shopId, hasLogin, suggestion }: { shopId: string; hasLogin: boolean; suggestion: string }) {
  const [state, action] = useActionState<ShopLoginState, FormData>(issueShopLoginAction.bind(null, shopId), {});
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <TextField label={hasLogin ? "New password for the shop" : "Password for the shop"} name="password" id={`shop-pw-${shopId}`} required minLength={10} maxLength={128}
            defaultValue={suggestion} autoComplete="off" spellCheck={false} hint="Change it to anything you like (10+ characters, letters and numbers)." />
        </div>
        <SubmitButton size="sm" variant={hasLogin ? "secondary" : "primary"} pendingText="Saving…">{hasLogin ? "Change password" : "Create shop login"}</SubmitButton>
      </form>
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.saved && (
        <Alert tone="green" title="Shop login ready">
          <span className="block">Shop ID <span className="font-mono font-bold">{state.saved.code}</span> · Password <span className="font-mono font-bold">{state.saved.password}</span></span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <CopyButton value={`Shop ID: ${state.saved.code}\nPassword: ${state.saved.password}`} label="Copy both" />
            <span className="text-xs">Write it down: it is not shown again. It works until the hackathon ends.</span>
          </span>
        </Alert>
      )}
    </div>
  );
}
