import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, TextField } from "@/components/ui";
import { FOOD_NEXT, FOOD_STATUS_LABEL, FOOD_STATUS_TONE, orderLabel } from "@/lib/domain/food";
import { formatRupees } from "@/lib/domain/fees";
import { updateFoodOrder } from "@/lib/food/order-actions";
import { formatTime } from "@/lib/format";
import type { FoodOrder, FoodOrderLine, FoodOrderStatus } from "@/lib/types";

export type BoardOrder = FoodOrder & {
  food_order_items: FoodOrderLine[];
  participants: { full_name: string; participant_code: string; teams: { name: string } | null } | null;
};

const COLUMNS: { status: FoodOrderStatus; title: string }[] = [
  { status: "placed", title: "New: accept or reject" },
  { status: "preparing", title: "Preparing" },
  { status: "ready", title: "Ready to collect" },
];

/** Live order columns plus recently finished orders (shared by food staff and shop logins). */
export function OrderBoard({ orders, tz, shopNames, back }: { orders: BoardOrder[]; tz: string; shopNames?: Map<string, string>; back: string }) {
  const done = orders.filter((o) => ["collected", "cancelled", "rejected"].includes(o.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 12);
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          return (
            <section key={col.status} aria-labelledby={`col-${col.status}`} className="space-y-3">
              <h2 id={`col-${col.status}`} className="flex items-center gap-2 text-lg font-bold text-ink">
                {col.title} <Badge tone={FOOD_STATUS_TONE[col.status]}>{list.length}</Badge>
              </h2>
              {!list.length ? <p className="rounded-md border-2 border-dashed border-line p-4 text-sm text-muted">Nothing here.</p> : list.map((o) => (
                <OrderCard key={o.id} order={o} tz={tz} shopName={shopNames?.get(o.shop_id) ?? null} back={back} />
              ))}
            </section>
          );
        })}
      </div>
      {done.length > 0 && (
        <Card className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-ink">Recently finished</h2>
          <ul className="divide-y-2 divide-line-soft text-sm">
            {done.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono font-bold">{orderLabel(o.order_no)}</span> · {o.participants?.full_name}
                  {shopNames && ` · ${shopNames.get(o.shop_id)}`}
                  {o.status === "rejected" && o.reject_reason && <span className="text-muted"> · {o.reject_reason}</span>}
                </span>
                <span className="flex items-center gap-2 text-muted">{formatTime(o.updated_at, tz)} <Badge tone={FOOD_STATUS_TONE[o.status]}>{FOOD_STATUS_LABEL[o.status]}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function OrderCard({ order: o, tz, shopName, back }: { order: BoardOrder; tz: string; shopName: string | null; back: string }) {
  const next = FOOD_NEXT[o.status];
  return (
    <article className="rounded-md border-2 border-line bg-surface p-4 shadow-brutal-sm" aria-label={`Order ${orderLabel(o.order_no)}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-2xl font-bold text-ink">{orderLabel(o.order_no)}</p>
          <p className="text-sm font-bold text-ink">{o.participants?.full_name}</p>
          <p className="text-xs text-muted">{o.participants?.participant_code}{o.participants?.teams?.name ? ` · ${o.participants.teams.name}` : ""}</p>
        </div>
        <div className="text-right text-xs text-muted">
          <p>{formatTime(o.created_at, tz)}</p>
          {shopName && <p className="font-bold text-ink">{shopName}</p>}
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {o.food_order_items.map((l, i) => <li key={i} className="flex justify-between gap-2"><span><span className="font-bold">{l.qty} ×</span> {l.name}</span>{!o.is_free && <span className="text-muted">{formatRupees(Number(l.price) * l.qty)}</span>}</li>)}
      </ul>
      {o.note && <p className="mt-2 rounded-sm bg-warn-tint px-2 py-1 text-sm text-ink">Note: {o.note}</p>}
      <p className="mt-2 text-sm font-bold text-ink">{o.is_free ? "Free" : `Collect ${formatRupees(Number(o.total))}`}</p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {next && (
          <form action={updateFoodOrder.bind(null, o.id, next.status, back)}>
            <SubmitButton size="sm" variant={next.status === "collected" ? "success" : "primary"}>{next.label}</SubmitButton>
          </form>
        )}
        {o.status === "placed" ? (
          <details className="w-full">
            <summary className="inline-flex min-h-9 cursor-pointer items-center rounded-md border-2 border-line px-3 text-xs font-bold text-ink">Reject</summary>
            <form action={updateFoodOrder.bind(null, o.id, "rejected", back)} className="mt-2 space-y-2">
              <TextField label="Reason for the team" name="reason" id={`reason-${o.id}`} required minLength={3} maxLength={200} placeholder="e.g. Sold out, kitchen closed" />
              <SubmitButton size="sm" variant="danger">Reject order</SubmitButton>
            </form>
          </details>
        ) : (
          <form action={updateFoodOrder.bind(null, o.id, "cancelled", back)}>
            <ConfirmSubmit size="sm" variant="secondary" message={`Cancel order ${orderLabel(o.order_no)}?`}>Cancel</ConfirmSubmit>
          </form>
        )}
      </div>
    </article>
  );
}
