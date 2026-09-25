import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { toLocalInput } from "@/lib/format";
import { EventForm } from "./event-form";

export const metadata: Metadata = { title: "Event Setup" };

export default async function EventSetupPage() {
  await requirePermission("manage_event");
  const h = await getHackathon();
  if (!h) return <EmptyState title="No event configured">Apply the migrations and seed (or insert a hackathon row) first — see README.</EmptyState>;
  const tz = h.timezone;
  return (
    <>
      <PageHeader title="Event Setup" description="Name, dates, venue, team size and contact details. These appear on the public page, portals and ID cards." />
      <EventForm
        initial={{
          ...h,
          starts_at: toLocalInput(h.starts_at, tz), ends_at: toLocalInput(h.ends_at, tz),
          registration_opens_at: toLocalInput(h.registration_opens_at, tz), registration_closes_at: toLocalInput(h.registration_closes_at, tz),
        }}
      />
    </>
  );
}
