import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/client";
import { Alert, Badge, Card, Flash, PageHeader } from "@/components/ui";
import { UUID } from "@/lib/actions";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { OPEN_FOOD_STATUSES } from "@/lib/domain/food";
import { createClient } from "@/lib/supabase/server";
import type { FoodItem, FoodShop } from "@/lib/types";
import { placeFoodOrder } from "../actions";
import { OrderForm } from "../order-form";
import { OrderSummary, type MyOrder } from "../order-summary";

export const metadata: Metadata = { title: "Shop menu" };

type RosterRow = { id: string; full_name: string };

/** One shop: its menu and the order form, plus the team's open orders here. */
export default async function PortalShopPage(props: PageProps<"/portal/food/[id]">) {
  const session = await requireParticipant();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: shop }, { data: items }, { data: orders }, { data: roster }] = await Promise.all([
    supabase.from("food_shops").select("*").eq("id", id).maybeSingle<FoodShop>(),
    supabase.from("food_items").select("*").eq("shop_id", id).order("sort_order").order("name").returns<FoodItem[]>(),
    supabase.from("food_orders").select("*, food_order_items(name, price, qty), food_shops(name, location)").eq("shop_id", id)
      .order("created_at", { ascending: false }).limit(10).returns<MyOrder[]>(),
    supabase.rpc("my_team_roster"),
  ]);
  if (!shop) notFound();
  const team = (roster ?? []) as RosterRow[];
  const names = new Map(team.map((m) => [m.id, m.full_name]));
  const members = session.isTeamAccount ? team.map((m) => ({ id: m.id, name: m.full_name })) : null;
  const open = (orders ?? []).filter((o) => OPEN_FOOD_STATUSES.includes(o.status));
  const tz = (await getHackathon())?.timezone;

  return (
    <>
      <PageHeader
        title={shop.name}
        back={{ href: "/portal/food", label: "All shops" }}
        description={[shop.location, shop.description].filter(Boolean).join(" · ") || undefined}
        actions={<><Badge tone={shop.is_open ? "green" : "neutral"}>{shop.is_open ? "Open" : "Closed"}</Badge><Badge tone={shop.is_free ? "violet" : "amber"}>{shop.is_free ? "Free" : "Pay at counter"}</Badge>{open.length > 0 && <AutoRefresh seconds={15} />}</>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      {open.length > 0 && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {open.map((o) => <OrderSummary key={o.id} order={o} tz={tz} forName={names.get(o.participant_id)} />)}
        </div>
      )}
      <Card>
        {!shop.is_open && <div className="mb-4"><Alert tone="amber" title="This shop is closed right now">You can look at the menu; ordering opens when the shop opens.</Alert></div>}
        {!items?.length ? <p className="text-sm text-muted">The menu is being set up.</p> : (
          <OrderForm
            action={placeFoodOrder.bind(null, shop.id)}
            free={shop.is_free}
            shopName={shop.id}
            members={members}
            closed={!shop.is_open}
            items={items.map((i) => ({ id: i.id, name: i.name, description: i.description, price: shop.is_free ? 0 : Number(i.price), isVeg: i.is_veg, available: i.is_available, limit: i.limit_per_person }))}
          />
        )}
      </Card>
    </>
  );
}
