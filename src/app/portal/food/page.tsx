import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/client";
import { Badge, EmptyState, Flash, PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { FOOD_STATUS_FOR_TEAM, FOOD_STATUS_TONE, OPEN_FOOD_STATUSES, orderLabel } from "@/lib/domain/food";
import { createClient } from "@/lib/supabase/server";
import type { FoodShop } from "@/lib/types";
import { OrderSummary, type MyOrder } from "./order-summary";

export const metadata: Metadata = { title: "Food" };

type RosterRow = { id: string; full_name: string };

/** Shops to choose from, plus the team's orders and their status. */
export default async function PortalFoodPage(props: PageProps<"/portal/food">) {
  await requireParticipant();
  const sp = await props.searchParams;
  const hackathon = await getHackathon();
  const supabase = await createClient();
  const [{ data: shops }, { data: items }, { data: orders }, { data: roster }] = await Promise.all([
    supabase.from("food_shops").select("*").order("is_open", { ascending: false }).order("name").returns<FoodShop[]>(),
    supabase.from("food_items").select("shop_id, is_available").returns<{ shop_id: string; is_available: boolean }[]>(),
    supabase.from("food_orders").select("*, food_order_items(name, price, qty), food_shops(name, location)")
      .order("created_at", { ascending: false }).limit(30).returns<MyOrder[]>(),
    supabase.rpc("my_team_roster"),
  ]);
  const names = new Map(((roster ?? []) as RosterRow[]).map((m) => [m.id, m.full_name]));
  const available = new Map<string, number>();
  for (const i of items ?? []) if (i.is_available) available.set(i.shop_id, (available.get(i.shop_id) ?? 0) + 1);
  const open = (orders ?? []).filter((o) => OPEN_FOOD_STATUSES.includes(o.status));
  const past = (orders ?? []).filter((o) => !OPEN_FOOD_STATUSES.includes(o.status));

  return (
    <>
      <PageHeader
        title="Food"
        description="Choose a shop to see its menu and order. The shop accepts your order, and you collect it when it shows Ready to collect."
        actions={open.length > 0 ? <AutoRefresh seconds={15} /> : undefined}
      />
      <Flash notice={sp.notice} error={sp.error} />

      {open.length > 0 && (
        <section aria-labelledby="open-orders" className="mb-8">
          <h2 id="open-orders" className="mb-3 text-lg font-bold text-ink">Your open orders</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {open.map((o) => <OrderSummary key={o.id} order={o} tz={hackathon?.timezone} forName={names.get(o.participant_id)} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="shops-heading">
        <h2 id="shops-heading" className="mb-3 text-lg font-bold text-ink">Shops</h2>
        {!shops?.length ? (
          <EmptyState title="No food shops yet">The organisers will add the food shops before the event.</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shops.map((shop) => (
              <li key={shop.id}>
                <Link href={`/portal/food/${shop.id}`}
                  className={`press flex h-full flex-col rounded-lg border-2 border-line p-5 shadow-brutal ${shop.is_open ? "bg-surface hover:bg-paper-2" : "bg-paper-2 opacity-80"}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-heading text-xl font-bold text-ink">{shop.name}</span>
                    <Badge tone={shop.is_open ? "green" : "neutral"}>{shop.is_open ? "Open" : "Closed"}</Badge>
                  </span>
                  {shop.location && <span className="mt-1 text-sm text-ink-soft">{shop.location}</span>}
                  {shop.description && <span className="mt-1 text-sm text-muted">{shop.description}</span>}
                  <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
                    <Badge tone={shop.is_free ? "violet" : "amber"}>{shop.is_free ? "Free" : "Pay at counter"}</Badge>
                    <span className="font-bold text-grass">{available.get(shop.id) ?? 0} {available.get(shop.id) === 1 ? "item" : "items"} · See menu →</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="past-orders" className="mt-8">
          <h2 id="past-orders" className="mb-3 text-lg font-bold text-ink">Earlier orders</h2>
          <ul className="divide-y-2 divide-line-soft rounded-md border-2 border-line bg-surface text-sm">
            {past.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  <span className="font-mono font-bold">{orderLabel(o.order_no)}</span>{names.get(o.participant_id) ? ` · ${names.get(o.participant_id)}` : ""} · {o.food_shops?.name} · {o.food_order_items.map((l) => `${l.qty} × ${l.name}`).join(", ")}
                  {o.status === "rejected" && o.reject_reason && <span className="block text-danger">Reason: {o.reject_reason}</span>}
                </span>
                <Badge tone={FOOD_STATUS_TONE[o.status]}>{FOOD_STATUS_FOR_TEAM[o.status]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
