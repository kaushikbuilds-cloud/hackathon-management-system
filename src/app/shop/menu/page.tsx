import type { Metadata } from "next";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, Checkbox, EmptyState, Flash, PageHeader, SelectField, TextField } from "@/components/ui";
import { requireVendor } from "@/lib/auth";
import { formatRupees } from "@/lib/domain/fees";
import { createClient } from "@/lib/supabase/server";
import type { FoodItem, FoodShop } from "@/lib/types";
import { deleteMyItem, saveMyItem, setMyItemAvailable } from "../actions";

export const metadata: Metadata = { title: "Menu & prices" };

const DIET = [{ value: "veg", label: "Veg" }, { value: "nonveg", label: "Non-veg" }];

/** The shop edits its own menu: items, prices and what is sold out. */
export default async function ShopMenuPage(props: PageProps<"/shop/menu">) {
  const session = await requireVendor();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: shop }, { data: items }] = await Promise.all([
    supabase.from("food_shops").select("*").eq("id", session.shopId).single<FoodShop>(),
    supabase.from("food_items").select("*").eq("shop_id", session.shopId).order("sort_order").order("name").returns<FoodItem[]>(),
  ]);
  const free = Boolean(shop?.is_free);

  return (
    <>
      <PageHeader title="Menu & prices" description={free ? "This is a free counter: teams do not pay. You can still change items and mark them sold out." : "Changes show to teams straight away. Mark an item sold out when it runs out."} />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {!items?.length ? <EmptyState title="Your menu is empty">Add your first item on the right.</EmptyState> : items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-ink">
                    <span className={item.is_veg ? "text-ok" : "text-danger"} aria-hidden="true">●</span> {item.name}
                    {!item.is_available && <Badge tone="red" className="ml-2">Sold out</Badge>}
                  </p>
                  <p className="text-sm text-muted">{free ? "Free" : formatRupees(Number(item.price))}{item.limit_per_person ? ` · max ${item.limit_per_person} per person` : ""}{item.description ? ` · ${item.description}` : ""}</p>
                </div>
                <form action={setMyItemAvailable.bind(null, item.id, !item.is_available)}>
                  <SubmitButton size="sm" variant="secondary">{item.is_available ? "Mark sold out" : "Back in stock"}</SubmitButton>
                </form>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-grass">Edit item or price</summary>
                <div className="mt-3"><ItemForm free={free} item={item} /></div>
                <form action={deleteMyItem.bind(null, item.id)} className="mt-3">
                  <ConfirmSubmit size="sm" variant="danger" message={`Remove ${item.name} from your menu?`}>Remove item</ConfirmSubmit>
                </form>
              </details>
            </Card>
          ))}
        </div>
        <Card>
          <CardTitle>Add an item</CardTitle>
          <ItemForm free={free} />
        </Card>
      </div>
    </>
  );
}

function ItemForm({ free, item }: { free: boolean; item?: FoodItem }) {
  const p = item ? `my-${item.id}-` : "my-new-";
  return (
    <form action={saveMyItem} className="space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField label="Item name" name="name" id={`${p}name`} required maxLength={80} defaultValue={item?.name} placeholder="e.g. Masala dosa" />
      {free
        ? <input type="hidden" name="price" value="0" />
        : <TextField label="Price (₹)" name="price" id={`${p}price`} type="number" min={0} max={100000} step="0.5" required defaultValue={item ? Number(item.price) : undefined} />}
      <SelectField label="Veg / non-veg" name="diet" id={`${p}diet`} defaultValue={item && !item.is_veg ? "nonveg" : "veg"} options={DIET} />
      <TextField label="Description (optional)" name="description" id={`${p}desc`} maxLength={200} defaultValue={item?.description ?? ""} />
      <Checkbox name="is_available" label="Available" defaultChecked={item ? item.is_available : true} />
      <SubmitButton size="sm">{item ? "Save" : "Add item"}</SubmitButton>
    </form>
  );
}
