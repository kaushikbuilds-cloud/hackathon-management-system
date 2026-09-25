import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, EmptyState, Flash, LinkButton, PageHeader, TextField } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { formatDateTime, toLocalInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Meal } from "@/lib/types";
import { deleteMeal, saveMeal, setMealOpen } from "./actions";

export const metadata: Metadata = { title: "Meal Tracking" };

/** Every meal with how many people have been served out of everyone eligible. */
export default async function MealsPage(props: PageProps<"/staff/food/meals">) {
  await requirePermission("manage_food");
  const sp = await props.searchParams;
  const tz = (await getHackathon())?.timezone ?? "Asia/Kolkata";
  const supabase = await createClient();
  const [{ data: meals }, { data: servings }, { data: eligible }] = await Promise.all([
    supabase.from("meals").select("*").order("serves_at", { ascending: true, nullsFirst: false }).order("created_at").returns<Meal[]>(),
    supabase.from("meal_servings").select("meal_id").returns<{ meal_id: string }[]>(),
    supabase.rpc("meal_eligible_count"),
  ]);
  const served = new Map<string, number>();
  for (const s of servings ?? []) served.set(s.meal_id, (served.get(s.meal_id) ?? 0) + 1);
  const total = Number(eligible ?? 0);

  return (
    <>
      <PageHeader
        title="Meal Tracking"
        back={{ href: "/staff/food", label: "Food Orders" }}
        description={`Scan each person's ID card at the counter. Everyone gets one serving per meal; ${total} people are eligible (members of teams that were not rejected).`}
        actions={<AutoRefresh seconds={15} />}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {!meals?.length ? <EmptyState title="No meals yet">Add each meal you serve, e.g. Day 1 Lunch, Day 1 Dinner, Day 2 Breakfast.</EmptyState> : meals.map((m) => {
            const n = served.get(m.id) ?? 0;
            const pct = total ? Math.min(100, Math.round((n / total) * 100)) : 0;
            return (
              <Card key={m.id}>
                <CardTitle
                  description={m.serves_at ? formatDateTime(m.serves_at, tz) : undefined}
                  actions={<Badge tone={m.is_open ? "green" : "neutral"}>{m.is_open ? "Serving now" : "Closed"}</Badge>}
                >
                  <Link href={`/staff/food/meals/${m.id}`} className="hover:underline">{m.name}</Link>
                </CardTitle>
                <p className="text-sm font-bold text-ink"><span className="font-heading text-3xl">{n}</span> of {total} served · {total - n > 0 ? `${total - n} left` : "everyone served"}</p>
                <div className="mt-2 h-4 rounded-sm border-2 border-line bg-paper" role="img" aria-label={`${pct}% served`}>
                  <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <LinkButton href={`/staff/food/meals/${m.id}`} size="sm">{m.is_open ? "Open counter" : "View"}</LinkButton>
                  <form action={setMealOpen.bind(null, m.id, !m.is_open, "/staff/food/meals")}>
                    <SubmitButton size="sm" variant={m.is_open ? "secondary" : "success"}>{m.is_open ? "Stop serving" : "Start serving"}</SubmitButton>
                  </form>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-bold text-brand">Edit</summary>
                  <div className="mt-3"><MealForm meal={m} tz={tz} /></div>
                  <form action={deleteMeal.bind(null, m.id)} className="mt-3">
                    <ConfirmSubmit size="sm" variant="danger" message={`Delete ${m.name} and its ${n} servings?`}>Delete meal</ConfirmSubmit>
                  </form>
                </details>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardTitle>Add a meal</CardTitle>
          <MealForm tz={tz} />
        </Card>
      </div>
    </>
  );
}

function MealForm({ meal, tz }: { meal?: Meal; tz: string }) {
  const p = meal ? `meal-${meal.id}-` : "meal-new-";
  return (
    <form action={saveMeal} className="space-y-3">
      {meal && <input type="hidden" name="id" value={meal.id} />}
      <TextField label="Meal name" name="name" id={`${p}name`} required maxLength={60} defaultValue={meal?.name} placeholder="e.g. Day 1 Lunch" />
      <TextField label="Serving time (optional)" name="serves_at" id={`${p}at`} type="datetime-local" defaultValue={toLocalInput(meal?.serves_at, tz)} hint={`Event time zone (${tz}).`} />
      <SubmitButton size="sm">{meal ? "Save" : "Add meal"}</SubmitButton>
    </form>
  );
}
