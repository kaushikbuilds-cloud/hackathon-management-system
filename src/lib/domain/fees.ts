/** Registration fee helpers shared by the form (client) and the server. */
export type FeeSettings = { amount: number; basis: "team" | "member"; upiId: string; payee: string | null; instructions: string | null };

export const UTR_RE = /^[A-Za-z0-9]{6,35}$/;

export function feeFor(fee: Pick<FeeSettings, "amount" | "basis">, members: number): number {
  const total = fee.basis === "member" ? fee.amount * Math.max(1, members) : fee.amount;
  return Math.round(total * 100) / 100;
}

export function formatRupees(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}

/** Standard UPI payment link (NPCI deep link); every UPI app understands it and its QR form. */
export function upiLink(fee: Pick<FeeSettings, "upiId" | "payee">, amount: number, note: string): string {
  const params = new URLSearchParams({ pa: fee.upiId, am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 50) });
  if (fee.payee) params.set("pn", fee.payee);
  return `upi://pay?${params.toString()}`;
}

/** Normalises what people paste as a UTR / transaction ID. */
export function normalizeUtr(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}
