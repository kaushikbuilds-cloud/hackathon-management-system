import type { Metadata } from "next";
import { AutoRefresh, ConfirmSubmit } from "@/components/client";
import { Badge, Card, CardTitle, EmptyState, Flash, PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { FOOD_STATUS_LABEL, FOOD_STATUS_TONE, OPEN_FOOD_STATUSES, orderLabel } from "@/lib/domain/food";
import { formatRupees } from "@/lib/domain/fees";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { FoodItem, FoodOrder, FoodOrderLine, FoodShop } from "@/lib/types";
import { cancelFoodOrder, placeFoodOrder } from "./actions";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "Food" };

type MyOrder = FoodOrder & { food_order_items: FoodOrderLine[]; food_shops: { name: string; location: string | null } | null };

export default async function PortalFoodPage(props: PageProps<"/portal/food">) {
  await requireParticipant();
  const sp = await props.searchParams;
  const hackathon = await getHackathon();
  const supabase = await createClient();
  const [{ data: shops }, { data: items }, { data: orders }] = await Promise.all([
    supabase.from("food_shops").select("*").eq("is_open", true).order("name").returns<FoodShop[]>(),
    supabase.from("food_items").select("*").order("sort_order").order("name").returns<FoodItem[]>(),
    supabase.from("food_orders").select("*, food_order_items(name, price, qty), food_shops(name, location)")
      .order("created_at", { ascending: false }).limit(30).returns<MyOrder[]>(),
  ]);
  const open = (orders ?? []).filter((o) => OPEN_FOOD_STATUSES.includes(o.status));
  const past = (orders ?? []).filter((o) => !OPEN_FOOD_STATUSES.includes(o.status));

  return (
    <>
      <PageHeader
        title="Food"
        description="Order from the counters that are open. You'll get an order number: collect your food when it shows Ready to collect."
        actions={open.length > 0 ? <AutoRefresh seconds={15} /> : undefined}
      />
      <Flash notice={sp.notice} error={sp.error} />

      {open.length > 0 && (
        <section aria-labelledby="open-orders" className="mb-8">
          <h2 id="open-orders" className="mb-3 text-lg font-bold text-ink">Your open orders</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {open.map((o) => <OrderSummary key={o.id} order={o} tz={hackathon?.timezone} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="menus" className="space-y-6">
        <h2 id="menus" className="text-lg font-bold text-ink">Counters open now</h2>
        {!shops?.length ? (
          <EmptyState title="No counters are open right now">Check back at meal times. Announcements will say when food is being served.</EmptyState>
        ) : shops.map((shop) => {
          const menu = (items ?? []).filter((i) => i.shop_id === shop.id);
          return (
            <Card key={shop.id}>
              <CardTitle
                description={[shop.location, shop.description].filter(Boolean).join(" · ") || undefined}
                actions={<Badge tone={shop.is_free ? "violet" : "amber"}>{shop.is_free ? "Free" : "Pay at counter"}</Badge>}
              >
                {shop.name}
              </CardTitle>
              {menu.length === 0 ? <p className="text-sm text-muted">The menu is being set up.</p> : (
                <OrderForm
                  action={placeFoodOrder.bind(null, shop.id)}
                  free={shop.is_free}
                  shopName={shop.id}
                  items={menu.map((i) => ({ id: i.id, name: i.name, description: i.description, price: shop.is_free ? 0 : Number(i.price), isVeg: i.is_veg, available: i.is_available, limit: i.limit_per_person }))}
                />
              )}
            </Card>
          );
        })}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="past-orders" className="mt-8">
          <h2 id="past-orders" className="mb-3 text-lg font-bold text-ink">Earlier orders</h2>
          <ul className="divide-y-2 divide-line-soft rounded-md border-2 border-line bg-surface text-sm">
            {past.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span><span className="font-mono font-bold">{orderLabel(o.order_no)}</span> · {o.food_shops?.name} · {o.food_order_items.map((l) => `${l.qty} × ${l.name}`).join(", ")}</span>
                <Badge tone={FOOD_STATUS_TONE[o.status]}>{FOOD_STATUS_LABEL[o.status]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function OrderSummary({ order: o, tz }: { order: MyOrder; tz?: string }) {
  return (
    <article className={`rounded-md border-2 border-line p-4 shadow-brutal-sm ${o.status === "ready" ? "bg-pop" : "bg-surface"}`} aria-label={`Order ${orderLabel(o.order_no)}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Order number</p>
          <p className="font-mono text-3xl font-bold text-ink">{orderLabel(o.order_no)}</p>
        </div>
        <Badge tone={FOOD_STATUS_TONE[o.status]}>{FOOD_STATUS_LABEL[o.status]}</Badge>
      </div>
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
