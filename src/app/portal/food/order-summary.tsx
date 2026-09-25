import { ConfirmSubmit } from "@/components/client";
import { Badge } from "@/components/ui";
import { FOOD_STATUS_FOR_TEAM, FOOD_STATUS_TONE, orderLabel } from "@/lib/domain/food";
import { formatRupees } from "@/lib/domain/fees";
import { formatDateTime } from "@/lib/format";
import type { FoodOrder, FoodOrderLine } from "@/lib/types";
import { cancelFoodOrder } from "./actions";

export type MyOrder = FoodOrder & { food_order_items: FoodOrderLine[]; food_shops: { name: string; location: string | null } | null };

/** One of the team's orders as the team sees it. */
export function OrderSummary({ order: o, tz, forName }: { order: MyOrder; tz?: string; forName?: string }) {
  return (
    <article className={`rounded-md border-2 border-line p-4 shadow-brutal-sm ${o.status === "ready" ? "bg-pop" : "bg-surface"}`} aria-label={`Order ${orderLabel(o.order_no)}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Order number</p>
          <p className="font-mono text-3xl font-bold text-ink">{orderLabel(o.order_no)}</p>
        </div>
        <Badge tone={FOOD_STATUS_TONE[o.status]}>{FOOD_STATUS_FOR_TEAM[o.status]}</Badge>
      </div>
      {forName && <p className="mt-2 text-sm text-ink">For <strong>{forName}</strong></p>}
      <p className="mt-2 text-sm font-bold text-ink">{o.food_shops?.name}{o.food_shops?.location ? ` · ${o.food_shops.location}` : ""}</p>
      <ul className="mt-1 text-sm text-ink">
        {o.food_order_items.map((l, i) => <li key={i}>{l.qty} × {l.name}</li>)}
      </ul>
      <p className="mt-2 text-sm text-ink">{o.is_free ? "Free" : `Pay ${formatRupees(Number(o.total))} when you collect`} · placed {formatDateTime(o.created_at, tz)}</p>
      {o.status === "ready" && <p className="mt-2 font-bold text-ink">Your food is ready. Show this order number at the counter.</p>}
      {o.status === "placed" && (
        <form action={cancelFoodOrder.bind(null, o.id)} className="mt-3">
          <ConfirmSubmit size="sm" variant="secondary" message={`Cancel order ${orderLabel(o.order_no)}?`}>Cancel order</ConfirmSubmit>
        </form>
      )}
    </article>
  );
}
