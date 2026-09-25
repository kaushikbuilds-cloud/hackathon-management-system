import { ConfirmSubmit } from "@/components/client";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";
import { orderLabel } from "@/lib/domain/food";
import { formatRupees } from "@/lib/domain/fees";
import { formatTime } from "@/lib/format";
import type { FoodOrder, FoodOrderLine } from "@/lib/types";
import { cancelFoodOrder } from "./actions";

export type MyOrder = FoodOrder & { food_order_items: FoodOrderLine[]; food_shops: { name: string; location: string | null } | null };

type Step = { key: string; title: string; icon: IconName; at?: string | null; state: "done" | "current" | "todo" | "failed" };

/** The four steps of an order and where this one is (a rejected or cancelled order stops after "placed"). */
export function trackSteps(o: Pick<FoodOrder, "status" | "created_at" | "updated_at" | "accepted_at" | "ready_at" | "collected_at">): Step[] {
  const order = ["placed", "preparing", "ready", "collected"];
  if (o.status === "rejected" || o.status === "cancelled") {
    return [
      { key: "placed", title: "Order placed", icon: "receipt", at: o.created_at, state: "done" },
      { key: o.status, title: o.status === "rejected" ? "Rejected by the shop" : "Cancelled", icon: "x", at: o.updated_at, state: "failed" },
    ];
  }
  const reached = order.indexOf(o.status);
  const at = [o.created_at, o.accepted_at, o.ready_at, o.collected_at];
  const base: Omit<Step, "state">[] = [
    { key: "placed", title: "Order placed", icon: "receipt" },
    { key: "preparing", title: "Accepted", icon: "food" },
    { key: "ready", title: "Ready to collect", icon: "bag" },
    { key: "collected", title: "Collected", icon: "check" },
  ];
  return base.map((s, i) => ({
    ...s,
    at: i <= reached ? at[i] : null,
    // The last reached step is "current" until the order is collected.
    state: i < reached || (i === reached && o.status === "collected") ? "done" : i === reached ? "current" : "todo",
  }));
}

function message(o: MyOrder): { tone: string; text: string } {
  const shop = o.food_shops?.name ?? "the shop";
  const pay = o.is_free ? "" : ` Pay ${formatRupees(Number(o.total))} at the counter.`;
  switch (o.status) {
    case "placed": return { tone: "bg-sky-tint", text: `Your order was sent to ${shop}. Waiting for them to accept it.` };
    case "preparing": return { tone: "bg-warn-tint", text: `${shop} accepted your order and is preparing it.` };
    case "ready": return { tone: "bg-pop", text: `Your food is ready! Show ${orderLabel(o.order_no)} at ${shop}${o.food_shops?.location ? ` (${o.food_shops.location})` : ""}.${pay}` };
    case "collected": return { tone: "bg-ok-tint", text: "Collected. Enjoy your food!" };
    case "rejected": return { tone: "bg-danger-tint", text: `${shop} could not take this order${o.reject_reason ? `: ${o.reject_reason}` : "."}` };
    default: return { tone: "bg-paper-2", text: "This order was cancelled." };
  }
}

/** One of the team's orders as a live tracker: steps with times, what happens next, and the items. */
export function OrderSummary({ order: o, tz, forName }: { order: MyOrder; tz?: string; forName?: string }) {
  const steps = trackSteps(o);
  const msg = message(o);
  return (
    <article className="rounded-lg border-2 border-line bg-surface p-5 shadow-brutal" aria-label={`Order ${orderLabel(o.order_no)} tracking`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">Track your order</p>
          <p className="font-mono text-3xl font-bold text-ink">{orderLabel(o.order_no)}</p>
        </div>
        <p className="text-right text-sm text-ink">
          <span className="block font-bold">{o.food_shops?.name}</span>
          {forName && <span className="block">For {forName}</span>}
        </p>
      </div>

      <ol className="mt-5 grid gap-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Order progress">
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex flex-col items-center text-center" aria-current={s.state === "current" ? "step" : undefined}>
            {i > 0 && (
              <span aria-hidden="true" className={cx(
                "absolute top-5 right-1/2 h-1 w-full -translate-y-1/2",
                s.state === "todo" ? "border-t-2 border-dashed border-line-soft" : s.state === "failed" ? "bg-danger" : "bg-ink",
              )} />
            )}
            <span className={cx(
              "relative z-10 grid size-10 place-items-center rounded-full border-2 border-line",
              s.state === "done" && "bg-pop text-ink",
              s.state === "current" && "bg-brand text-white shadow-brutal-sm",
              s.state === "todo" && "border-line-soft bg-surface text-muted",
              s.state === "failed" && "bg-danger text-white",
            )}>
              {s.state === "current" && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-brand opacity-40 motion-safe:animate-ping" />}
              <Icon name={s.state === "done" ? "check" : s.icon} className="relative size-5" />
            </span>
            <span className={cx("mt-2 text-xs font-bold sm:text-sm", s.state === "todo" ? "text-muted" : "text-ink")}>{s.title}</span>
            <span className="text-xs text-ink-soft">
              {s.at ? formatTime(s.at, tz) : s.state === "todo" ? "Waiting" : ""}
              <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (current step)" : s.state === "failed" ? " (stopped)" : " (not yet)"}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className={cx("mt-5 rounded-md border-2 border-line px-3 py-2 text-sm font-bold text-ink", msg.tone)} role="status">{msg.text}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t-2 border-line-soft pt-3 text-sm text-ink">
        <ul>
          {o.food_order_items.map((l, i) => <li key={i}><span className="font-bold">{l.qty} ×</span> {l.name}</li>)}
          {o.note && <li className="text-ink-soft">Note: {o.note}</li>}
        </ul>
        <p className="font-bold">{o.is_free ? "Free" : formatRupees(Number(o.total))}</p>
      </div>
      {o.status === "placed" && (
        <form action={cancelFoodOrder.bind(null, o.id)} className="mt-3">
          <ConfirmSubmit size="sm" variant="secondary" message={`Cancel order ${orderLabel(o.order_no)}?`}>Cancel order</ConfirmSubmit>
        </form>
      )}
    </article>
  );
}
