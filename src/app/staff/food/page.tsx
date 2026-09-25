import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { OrderBoard } from "@/components/food/order-board";
import { Badge, EmptyState, Flash, LinkButton, PageHeader, cx } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadBoardOrders } from "@/lib/food/board-data";
import { createClient } from "@/lib/supabase/server";
import type { FoodShop } from "@/lib/types";
import { setShopOpen } from "./actions";

export const metadata: Metadata = { title: "Food Orders" };

/** Every shop's orders in one place (shops also have their own portal for theirs). */
export default async function FoodOrdersPage(props: PageProps<"/staff/food">) {
  const session = await requirePermission("manage_food");
  const sp = await props.searchParams;
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  const { data: shops } = await (await createClient()).from("food_shops").select("*").order("name").returns<FoodShop[]>();
  const shopParam = typeof sp.shop === "string" ? sp.shop : "";
  const shop = (shops ?? []).find((s) => s.id === shopParam) ?? null;
  const back = shop ? `/staff/food?shop=${shop.id}` : "/staff/food";
  const orders = await loadBoardOrders(session.hackathonId, shop?.id);
  const shopName = new Map((shops ?? []).map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title="Food Orders"
        description="Orders from every shop. Each shop also has its own login to accept, reject and hand over its orders."
        actions={<><AutoRefresh seconds={10} /><LinkButton href="/staff/food/menu" variant="secondary">Shops, menus &amp; logins</LinkButton></>}
      />
      <Flash notice={sp.notice} error={sp.error} />

      {!shops?.length ? (
        <EmptyState title="No food shops yet" action={<LinkButton href="/staff/food/menu">Add a shop</LinkButton>}>
          Add a shop (free meals or a paid stall) and its menu, then open it for orders.
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Filter by shop" className="mb-6 flex flex-wrap gap-2">
            <FilterChip href="/staff/food" active={!shop}>All shops</FilterChip>
            {shops.map((s) => <FilterChip key={s.id} href={`/staff/food?shop=${s.id}`} active={shop?.id === s.id}>{s.name}</FilterChip>)}
          </nav>
          <div className="mb-6 flex flex-wrap gap-3">
            {(shop ? [shop] : shops).map((s) => (
              <form key={s.id} action={setShopOpen.bind(null, s.id, !s.is_open)} className="flex items-center gap-2 rounded-md border-2 border-line bg-surface px-3 py-2 shadow-brutal-sm">
                <span className="font-bold text-ink">{s.name}</span>
                <Badge tone={s.is_open ? "green" : "neutral"}>{s.is_open ? "Taking orders" : "Closed"}</Badge>
                <Badge tone={s.is_free ? "violet" : "amber"}>{s.is_free ? "Free" : "Paid at counter"}</Badge>
                <SubmitButton size="sm" variant="secondary">{s.is_open ? "Close" : "Open"}</SubmitButton>
              </form>
            ))}
          </div>

          <OrderBoard orders={orders} tz={tz} shopNames={shop ? undefined : shopName} back={back} />
        </>
      )}
    </>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cx("inline-flex min-h-9 items-center rounded-md border-2 border-line px-3 text-sm font-bold", active ? "bg-ink text-paper" : "bg-surface text-ink hover:bg-paper-2")}>
      {children}
    </Link>
  );
}
