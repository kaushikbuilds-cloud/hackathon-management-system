"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/client";
import { SelectField, TextField } from "@/components/ui";
import { formatRupees } from "@/lib/domain/fees";

type MenuItem = { id: string; name: string; description: string | null; price: number; isVeg: boolean; available: boolean; limit: number | null };

/** Menu with quantity steppers and a running total; the database re-checks every line. */
export function OrderForm({ action, items, free, shopName, members, closed = false }: {
  action: (formData: FormData) => void; items: MenuItem[]; free: boolean; shopName: string; members: { id: string; name: string }[] | null; closed?: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const set = (id: string, n: number, max: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(n, max)) }));
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = items.reduce((sum, i) => sum + (qty[i.id] ?? 0) * i.price, 0);

  return (
    <form action={action} className="space-y-4">
      {members && (
        <SelectField label="Who is this order for?" name="member" id={`member-${shopName}`} required defaultValue=""
          options={[{ value: "", label: "Choose a team member" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
      )}
      <ul className="divide-y-2 divide-line-soft rounded-md border-2 border-line">
        {items.map((i) => {
          const max = Math.min(i.limit ?? 20, 20);
          const n = qty[i.id] ?? 0;
          return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-bold text-ink">
                  <span className={i.isVeg ? "text-ok" : "text-danger"} aria-hidden="true">●</span> {i.name}
                  <span className="sr-only">{i.isVeg ? " (veg)" : " (non-veg)"}</span>
                </p>
                <p className="text-sm text-muted">
                  {free ? "Free" : formatRupees(i.price)}
                  {i.limit ? ` · max ${i.limit} per person` : ""}
                  {i.description ? ` · ${i.description}` : ""}
                </p>
              </div>
              {i.available ? (
                <div className="flex items-center gap-2">
                  <button type="button" className="press grid size-11 place-items-center rounded-md border-2 border-line bg-surface text-lg font-bold shadow-brutal-sm disabled:opacity-40"
                    onClick={() => set(i.id, n - 1, max)} disabled={n === 0} aria-label={`One less ${i.name}`}>−</button>
                  <output className="w-8 text-center font-mono text-lg font-bold" aria-live="polite" aria-label={`${i.name} quantity`}>{n}</output>
                  <button type="button" className="press grid size-11 place-items-center rounded-md border-2 border-line bg-pop text-lg font-bold shadow-brutal-sm disabled:opacity-40"
                    onClick={() => set(i.id, n + 1, max)} disabled={n >= max} aria-label={`One more ${i.name}`}>+</button>
                  {n > 0 && <input type="hidden" name={`qty_${i.id}`} value={n} />}
                </div>
              ) : <span className="rounded-sm border-2 border-line bg-danger-tint px-2 py-0.5 text-xs font-bold">Sold out</span>}
            </li>
          );
        })}
      </ul>
      <TextField label="Note for the counter (optional)" name="note" id={`note-${shopName}`} maxLength={200} placeholder="e.g. less spicy, no onion" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold text-ink">{count} item{count === 1 ? "" : "s"} · {free ? "Free" : `${formatRupees(total)} (pay at the counter)`}</p>
        <SubmitButton disabled={count === 0 || closed} pendingText="Sending order…">Place order</SubmitButton>
      </div>
    </form>
  );
}
