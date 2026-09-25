import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, Flash, LinkButton, PageHeader, cx } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { FOOD_NEXT, FOOD_STATUS_LABEL, FOOD_STATUS_TONE, orderLabel } from "@/lib/domain/food";
import { formatRupees } from "@/lib/domain/fees";
import { formatTime, requestTime } from "@/lib/format";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { FoodOrder, FoodOrderLine, FoodOrderStatus, FoodShop } from "@/lib/types";
import { setOrderStatus, setShopOpen } from "./actions";

export const metadata: Metadata = { title: "Food Orders" };

type BoardOrder = FoodOrder & {
  food_order_items: FoodOrderLine[];
  participants: { full_name: string; participant_code: string; teams: { name: string } | null } | null;
};

const COLUMNS: { status: FoodOrderStatus; title: string }[] = [
  { status: "placed", title: "New" },
  { status: "preparing", title: "Preparing" },
  { status: "ready", title: "Ready to collect" },
];

/** The counter's live board: new → preparing → ready → collected. */
export default async function FoodOrdersPage(props: PageProps<"/staff/food">) {
  const session = await requirePermission("manage_food");
  const sp = await props.searchParams;
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  const { data: shops } = await (await createClient()).from("food_shops").select("*").order("name").returns<FoodShop[]>();
  const shopParam = typeof sp.shop === "string" ? sp.shop : "";
  const shop = (shops ?? []).find((s) => s.id === shopParam) ?? null;
  const back = shop ? `/staff/food?shop=${shop.id}` : "/staff/food";

  // Officials never read participant rows directly, so names come through the
  // service client, scoped explicitly to this hackathon.
  let query = createServiceClient()
    .from("food_orders")
    .select("*, food_order_items(name, price, qty), participants(full_name, participant_code, teams(name))")
    .eq("hackathon_id", session.hackathonId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (shop) query = query.eq("shop_id", shop.id);
  const since = new Date(requestTime() - 12 * 3600 * 1000).toISOString();
  const { data: orders } = await query.or(`status.in.(placed,preparing,ready),updated_at.gte.${since}`).returns<BoardOrder[]>();
  const shopName = new Map((shops ?? []).map((s) => [s.id, s.name]));
  const done = (orders ?? []).filter((o) => o.status === "collected" || o.status === "cancelled").reverse().slice(0, 12);

  return (
    <>
      <PageHeader
        title="Food Orders"
        description="Orders appear here the moment a participant places them. Move each one along as you prepare and hand it over."
        actions={<><AutoRefresh seconds={10} /><LinkButton href="/staff/food/meals" variant="secondary">Meal tracking</LinkButton><LinkButton href="/staff/food/menu" variant="secondary">Shops &amp; menus</LinkButton></>}
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

          <div className="grid gap-6 lg:grid-cols-3">
            {COLUMNS.map((col) => {
              const list = (orders ?? []).filter((o) => o.status === col.status);
              return (
                <section key={col.status} aria-labelledby={`col-${col.status}`} className="space-y-3">
                  <h2 id={`col-${col.status}`} className="flex items-center gap-2 text-lg font-bold text-ink">
                    {col.title} <Badge tone={FOOD_STATUS_TONE[col.status]}>{list.length}</Badge>
                  </h2>
                  {!list.length ? <p className="rounded-md border-2 border-dashed border-line p-4 text-sm text-muted">Nothing here.</p> : list.map((o) => (
                    <OrderCard key={o.id} order={o} tz={tz} shopName={shop ? null : shopName.get(o.shop_id) ?? ""} back={back} />
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
                    <span><span className="font-mono font-bold">{orderLabel(o.order_no)}</span> · {o.participants?.full_name}{!shop && ` · ${shopName.get(o.shop_id)}`}</span>
                    <span className="flex items-center gap-2 text-muted">{formatTime(o.updated_at, tz)} <Badge tone={FOOD_STATUS_TONE[o.status]}>{FOOD_STATUS_LABEL[o.status]}</Badge></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
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
      <div className="mt-3 flex flex-wrap gap-2">
        {next && (
          <form action={setOrderStatus.bind(null, o.id, next.status, back)}>
            <SubmitButton size="sm" variant={next.status === "collected" ? "success" : "primary"}>{next.label}</SubmitButton>
          </form>
        )}
        <form action={setOrderStatus.bind(null, o.id, "cancelled", back)}>
          <ConfirmSubmit size="sm" variant="secondary" message={`Cancel order ${orderLabel(o.order_no)}?`}>Cancel</ConfirmSubmit>
        </form>
      </div>
    </article>
  );
}
