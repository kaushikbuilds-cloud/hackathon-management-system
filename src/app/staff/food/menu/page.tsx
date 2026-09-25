import type { Metadata } from "next";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, Checkbox, EmptyState, Flash, PageHeader, SelectField, TextField } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatRupees } from "@/lib/domain/fees";
import { suggestShopPassword } from "@/lib/domain/password";
import { getHackathon } from "@/lib/data/event";
import { formatDateTime } from "@/lib/format";
import { shopLoginEndsAt } from "@/lib/shops";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { FoodItem, FoodShop } from "@/lib/types";
import { deleteItem, deleteShop, saveItem, saveShop, setItemAvailable } from "../actions";
import { ShopLoginForm } from "./shop-login";

export const metadata: Metadata = { title: "Shops & Menus" };

const KIND = [{ value: "paid", label: "Paid — participants pay at the counter" }, { value: "free", label: "Free — meals provided by the organisers" }];
const DIET = [{ value: "veg", label: "Veg" }, { value: "nonveg", label: "Non-veg" }];

export default async function FoodMenuPage(props: PageProps<"/staff/food/menu">) {
  const session = await requirePermission("manage_food");
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: shops }, { data: items }] = await Promise.all([
    supabase.from("food_shops").select("*").order("created_at").returns<FoodShop[]>(),
    supabase.from("food_items").select("*").order("sort_order").order("name").returns<FoodItem[]>(),
  ]);
  const { data: logins } = await createServiceClient().from("profiles").select("shop_id, status, last_sign_in_at")
    .eq("hackathon_id", session.hackathonId).not("shop_id", "is", null).returns<{ shop_id: string; status: string; last_sign_in_at: string | null }[]>();
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "Asia/Kolkata";
  const loginEnds = shopLoginEndsAt(hackathon?.ends_at);
  const loginFor = new Map((logins ?? []).map((l) => [l.shop_id, l]));

  return (
    <>
      <PageHeader
        title="Shops & Menus"
        back={{ href: "/staff/food", label: "Food Orders" }}
        description="Free shops are for meals the organisers provide (set a per-person limit such as 1 lunch each). Paid shops show prices; participants pay when they collect."
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="space-y-6">
        <Card>
          <CardTitle>Add a shop</CardTitle>
          <ShopForm />
        </Card>
        {!shops?.length ? <EmptyState title="No shops yet">Add your first food counter above.</EmptyState> : shops.map((shop) => {
          const menu = (items ?? []).filter((i) => i.shop_id === shop.id);
          return (
            <Card key={shop.id}>
              <CardTitle
                description={[shop.location, shop.description].filter(Boolean).join(" · ") || undefined}
                actions={<><Badge tone={shop.is_free ? "violet" : "amber"}>{shop.is_free ? "Free" : "Paid"}</Badge><Badge tone={shop.is_open ? "green" : "neutral"}>{shop.is_open ? "Open" : "Closed"}</Badge></>}
              >
                {shop.name}
              </CardTitle>
              <div className="mb-4 rounded-md border-2 border-line bg-paper-2 p-3">
                <p className="text-sm font-bold text-ink">
                  Shop login: <span className="font-mono">{shop.code ?? "—"}</span>{" "}
                  <Badge tone={loginFor.get(shop.id) ? "green" : "neutral"}>{loginFor.get(shop.id) ? "Created" : "Not created yet"}</Badge>
                </p>
                <p className="mb-2 text-xs text-ink-soft">The shop signs in with this Shop ID and the password you set to accept or reject its orders and edit its own menu and prices. {loginEnds ? `The login works until ${formatDateTime(loginEnds.toISOString(), tz)} (a day after the hackathon ends).` : "The login works until a day after the hackathon ends (set the end date in Event Setup)."}</p>
                <ShopLoginForm shopId={shop.id} hasLogin={Boolean(loginFor.get(shop.id))} suggestion={suggestShopPassword(shop.name)} />
              </div>
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-bold text-brand">Edit shop</summary>
                <div className="mt-3"><ShopForm shop={shop} /></div>
                <form action={deleteShop.bind(null, shop.id)} className="mt-3">
                  <ConfirmSubmit variant="danger" size="sm" message={`Delete ${shop.name} and its menu?`}>Delete shop</ConfirmSubmit>
                </form>
              </details>

              {menu.length > 0 && (
                <ul className="mb-4 divide-y-2 divide-line-soft rounded-md border-2 border-line">
                  {menu.map((item) => (
                    <li key={item.id} className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-ink">
                            <span className={item.is_veg ? "text-ok" : "text-danger"} aria-hidden="true">●</span> {item.name}
                            {!item.is_available && <Badge tone="red" className="ml-2">Sold out</Badge>}
                          </p>
                          <p className="text-sm text-muted">
                            {shop.is_free ? "Free" : formatRupees(Number(item.price))}
                            {item.limit_per_person ? ` · max ${item.limit_per_person} per person` : ""}
                            {item.description ? ` · ${item.description}` : ""}
                          </p>
                        </div>
                        <form action={setItemAvailable.bind(null, item.id, !item.is_available)}>
                          <SubmitButton size="sm" variant="secondary">{item.is_available ? "Mark sold out" : "Back in stock"}</SubmitButton>
                        </form>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-brand">Edit item</summary>
                        <div className="mt-3"><ItemForm shop={shop} item={item} /></div>
                        <form action={deleteItem.bind(null, item.id)} className="mt-3">
                          <ConfirmSubmit variant="danger" size="sm" message={`Remove ${item.name} from the menu?`}>Remove item</ConfirmSubmit>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              <details open={menu.length === 0}>
                <summary className="cursor-pointer text-sm font-bold text-brand">Add menu item</summary>
                <div className="mt-3"><ItemForm shop={shop} /></div>
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ShopForm({ shop }: { shop?: FoodShop }) {
  const p = shop ? `shop-${shop.id}-` : "shop-new-";
  return (
    <form action={saveShop} className="space-y-3">
      {shop && <input type="hidden" name="id" value={shop.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Shop name" name="name" id={`${p}name`} required maxLength={80} defaultValue={shop?.name} placeholder="e.g. Main Hall Meals" />
        <SelectField label="Type" name="kind" id={`${p}kind`} defaultValue={shop?.is_free ? "free" : "paid"} options={KIND} />
        <TextField label="Location" name="location" id={`${p}loc`} maxLength={120} defaultValue={shop?.location ?? ""} placeholder="e.g. Block A ground floor" />
        <TextField label="Short description" name="description" id={`${p}desc`} maxLength={300} defaultValue={shop?.description ?? ""} />
      </div>
      <Checkbox name="is_open" label="Taking orders now" defaultChecked={shop?.is_open} hint="You can also open and close it from the Food Orders board." />
      <SubmitButton size="sm">{shop ? "Save shop" : "Add shop"}</SubmitButton>
    </form>
  );
}

function ItemForm({ shop, item }: { shop: FoodShop; item?: FoodItem }) {
  const p = item ? `item-${item.id}-` : `item-new-${shop.id}-`;
  return (
    <form action={saveItem} className="space-y-3">
      <input type="hidden" name="shop_id" value={shop.id} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Item name" name="name" id={`${p}name`} required maxLength={80} defaultValue={item?.name} placeholder={shop.is_free ? "e.g. Lunch" : "e.g. Masala chai"} />
        {shop.is_free
          ? <input type="hidden" name="price" value="0" />
          : <TextField label="Price (₹)" name="price" id={`${p}price`} type="number" min={0} max={100000} step="0.5" required defaultValue={item ? Number(item.price) : undefined} />}
        <SelectField label="Veg / non-veg" name="diet" id={`${p}diet`} defaultValue={item && !item.is_veg ? "nonveg" : "veg"} options={DIET} />
        <TextField label="Limit per person (optional)" name="limit_per_person" id={`${p}limit`} type="number" min={1} max={50} defaultValue={item?.limit_per_person ?? (shop.is_free && !item ? 1 : undefined)} hint="Leave empty for no limit." />
        <TextField label="Description (optional)" name="description" id={`${p}desc`} maxLength={200} defaultValue={item?.description ?? ""} className="md:col-span-2" />
      </div>
      <Checkbox name="is_available" label="Available" defaultChecked={item ? item.is_available : true} />
      <SubmitButton size="sm">{item ? "Save item" : "Add item"}</SubmitButton>
    </form>
  );
}
