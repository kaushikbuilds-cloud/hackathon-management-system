"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Card, TextField, buttonClass } from "@/components/ui";
import { feeFor, formatRupees, upiLink, type FeeSettings } from "@/lib/domain/fees";

/** Payment step: amount (live for per-member fees), UPI QR + app link, then UTR and screenshot. */
export function FeeStep({ fee, members, errors, utr }: { fee: FeeSettings; members: number; errors: Record<string, string>; utr?: string }) {
  const amount = feeFor(fee, members);
  const link = upiLink(fee, amount, "Hackathon registration fee");
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: 220, errorCorrectionLevel: "M" }).then((url) => alive && setQr(url)).catch(() => alive && setQr(null));
    return () => { alive = false; };
  }, [link]);

  return (
    <Card aria-labelledby="fee-heading">
      <h2 id="fee-heading" className="text-lg font-bold text-ink">Registration fee</h2>
      <p className="mt-1 text-sm text-muted">
        Pay by UPI, then enter the transaction ID and upload a screenshot. The organisers confirm your payment after checking it.
      </p>
      <div className="mt-4 grid gap-5 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="grid size-[180px] place-items-center rounded-md border-2 border-line bg-surface p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr ? <img src={qr} alt={`UPI QR code to pay ${formatRupees(amount)} to ${fee.upiId}`} className="size-full" /> : <span className="text-xs text-muted">Loading QR…</span>}
          </div>
          <a href={link} className={buttonClass("secondary", "sm", "md:hidden")}>Pay with a UPI app</a>
        </div>
        <div className="space-y-3">
          <div className="rounded-md border-2 border-line bg-pop px-4 py-3">
            <p className="text-xs font-bold tracking-wide text-ink uppercase">Amount to pay</p>
            <p className="font-heading text-3xl font-bold text-ink" aria-live="polite">{formatRupees(amount)}</p>
            {fee.basis === "member" && <p className="text-xs font-bold text-ink">{formatRupees(fee.amount)} × {members} member{members === 1 ? "" : "s"}</p>}
          </div>
          <p className="text-sm text-ink">
            UPI ID: <span className="font-mono font-bold">{fee.upiId}</span>
            {fee.payee && <> · {fee.payee}</>}
          </p>
          {fee.instructions && <p className="text-sm whitespace-pre-line text-ink-soft">{fee.instructions}</p>}
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextField label="UPI transaction ID (UTR)" name="payment_utr" required maxLength={40} defaultValue={utr} error={errors.payment_utr}
          hint="12-digit number shown in your UPI app after paying." autoComplete="off" inputMode="text" />
        <div className="space-y-1.5">
          <label htmlFor="payment_proof" className="block text-sm font-bold text-ink">Payment screenshot<span className="ml-0.5 text-danger" aria-hidden="true">*</span></label>
          <input id="payment_proof" name="payment_proof" type="file" required accept="image/png,image/jpeg,application/pdf"
            aria-invalid={Boolean(errors.payment_proof)} aria-describedby={errors.payment_proof ? "payment_proof-error" : "payment_proof-hint"}
            className="block w-full cursor-pointer text-sm text-ink-soft file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-2 file:border-line file:bg-surface file:px-3 file:font-bold file:text-ink" />
          {errors.payment_proof ? (
            <p id="payment_proof-error" className="text-xs font-bold text-danger" role="alert">{errors.payment_proof}</p>
          ) : (
            <p id="payment_proof-hint" className="text-xs text-muted">PNG, JPG or PDF, up to 5 MB.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
