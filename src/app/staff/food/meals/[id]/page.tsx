import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, Flash, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { UUID } from "@/lib/actions";
import { getHackathon } from "@/lib/data/event";
import { formatTime } from "@/lib/format";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Meal } from "@/lib/types";
import { setMealOpen, undoServing } from "../actions";
import { MealScanner } from "./meal-scanner";

export const metadata: Metadata = { title: "Meal counter" };

type Serving = { id: number; served_at: string; method: string; participants: { full_name: string; participant_code: string; teams: { name: string } | null } | null };

export default async function MealCounterPage(props: PageProps<"/staff/food/meals/[id]">) {
  const session = await requirePermission("manage_food");
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const sp = await props.searchParams;
  const tz = (await getHackathon())?.timezone ?? "Asia/Kolkata";
  const supabase = await createClient();
  const { data: meal } = await supabase.from("meals").select("*").eq("id", id).maybeSingle<Meal>();
  if (!meal) notFound();
  // Names only, scoped to this hackathon (counter staff never read contact details).
  const [{ data: recent, count }, { data: eligible }] = await Promise.all([
    createServiceClient().from("meal_servings")
      .select("id, served_at, method, participants(full_name, participant_code, teams(name))", { count: "exact" })
      .eq("meal_id", id).eq("hackathon_id", session.hackathonId)
      .order("served_at", { ascending: false }).limit(25).returns<Serving[]>(),
    supabase.rpc("meal_eligible_count"),
  ]);
  const served = count ?? 0;
  const total = Number(eligible ?? 0);
  const back = `/staff/food/meals/${id}`;

  return (
    <>
      <PageHeader
        title={meal.name}
        back={{ href: "/staff/food/meals", label: "Meal Tracking" }}
        actions={<>
          <Badge tone={meal.is_open ? "green" : "neutral"}>{meal.is_open ? "Serving now" : "Closed"}</Badge>
          <form action={setMealOpen.bind(null, id, !meal.is_open, back)}>
            <SubmitButton variant={meal.is_open ? "secondary" : "success"}>{meal.is_open ? "Stop serving" : "Start serving"}</SubmitButton>
          </form>
          <a href={`/api/meals/${id}/csv`} className="text-sm font-bold text-brand underline-offset-4 hover:underline">Download list (CSV)</a>
        </>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Served" value={served} tone="green" />
        <Stat label="Still to eat" value={Math.max(0, total - served)} tone="amber" />
        <Stat label="Eligible" value={total} hint="Members of teams not rejected" />
      </div>
      <Card className="mb-6">
        <CardTitle description="Each scan records a serving at once. A second scan of the same card shows it was already served.">Counter</CardTitle>
        <MealScanner mealId={id} open={meal.is_open} />
      </Card>
      <Card>
        <CardTitle description={served > 25 ? `Latest 25 of ${served}. Download the CSV for everyone.` : undefined}>Served so far</CardTitle>
        {!recent?.length ? <p className="text-sm text-muted">Nobody has been served yet.</p> : (
          <Table caption={`Served for ${meal.name}`}>
            <thead><tr><Th>Time</Th><Th>Name</Th><Th>Participant ID</Th><Th>Team</Th><Th>How</Th><Th><span className="sr-only">Undo</span></Th></tr></thead>
            <tbody className="divide-y divide-line-soft">
              {recent.map((s) => (
                <tr key={s.id}>
                  <Td>{formatTime(s.served_at, tz)}</Td>
                  <Td className="font-bold">{s.participants?.full_name}</Td>
                  <Td className="font-mono">{s.participants?.participant_code}</Td>
                  <Td>{s.participants?.teams?.name}</Td>
                  <Td>{s.method === "qr" ? "QR scan" : "Name search"}</Td>
                  <Td>
                    <form action={undoServing.bind(null, id, s.id)}>
                      <ConfirmSubmit size="sm" variant="secondary" message={`Undo ${s.participants?.full_name}'s serving? They can then be served again.`}>Undo</ConfirmSubmit>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
