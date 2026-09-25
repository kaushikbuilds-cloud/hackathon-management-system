import type { Metadata } from "next";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { OrderBoard } from "@/components/food/order-board";
import { Badge, Card, Flash, PageHeader, Stat } from "@/components/ui";
import { requireVendor } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { formatRupees } from "@/lib/domain/fees";
import { loadBoardOrders } from "@/lib/food/board-data";
import { createClient } from "@/lib/supabase/server";
import type { FoodShop } from "@/lib/types";
import { setMyShopOpen } from "./actions";

export const metadata: Metadata = { title: "Orders" };

/** The shop's own live orders: accept or reject new ones, then ready and collected. */
export default async function ShopOrdersPage(props: PageProps<"/shop">) {
  const session = await requireVendor();
  const sp = await props.searchParams;
  const tz = (await getHackathon())?.timezone ?? "Asia/Kolkata";
  const { data: shop } = await (await createClient()).from("food_shops").select("*").eq("id", session.shopId).single<FoodShop>();
  const orders = await loadBoardOrders(session.hackathonId, session.shopId);
  const waiting = orders.filter((o) => o.status === "placed").length;
  const collectedToday = orders.filter((o) => o.status === "collected");
  const sales = collectedToday.reduce((sum, o) => sum + (o.is_free ? 0 : Number(o.total)), 0);

  return (
    <>
      <PageHeader
        title={shop?.name ?? "Orders"}
        description="New orders appear here by themselves. Accept or reject each one, mark it ready when it is cooked, and collected when handed over."
        actions={<AutoRefresh seconds={10} />}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col justify-between gap-3">
          <p className="text-xs font-bold tracking-wide text-ink uppercase">Shop status</p>
          <p><Badge tone={shop?.is_open ? "green" : "neutral"}>{shop?.is_open ? "Open: taking orders" : "Closed"}</Badge></p>
          <form action={setMyShopOpen.bind(null, !shop?.is_open)}>
            <SubmitButton variant={shop?.is_open ? "secondary" : "success"}>{shop?.is_open ? "Close shop" : "Open shop"}</SubmitButton>
          </form>
        </Card>
        <Stat label="Waiting for you" value={waiting} tone="amber" hint="New orders to accept or reject" />
        <Stat label="Collected (last 12 h)" value={collectedToday.length} tone="green" hint={shop?.is_free ? "Free counter" : `${formatRupees(sales)} collected`} />
      </div>
      <OrderBoard orders={orders} tz={tz} back="/shop" />
    </>
  );
}
