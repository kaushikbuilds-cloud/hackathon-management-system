import type { Metadata } from "next";
import { AnnouncementFeed, ScheduleList } from "@/components/announcements";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, Checkbox, EmptyState, Flash, PageHeader, SelectField, TextArea, TextField } from "@/components/ui";
import { isAdmin, requireStaff } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { formatDateTime, requestTime, toLocalInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Announcement, ScheduleItem } from "@/lib/types";
import { deleteAnnouncement, deleteScheduleItem, saveAnnouncement, saveScheduleItem } from "./actions";

export const metadata: Metadata = { title: "Announcements & Schedule" };

const AUDIENCE = [{ value: "all", label: "Everyone" }, { value: "participants", label: "Participants" }, { value: "staff", label: "Staff only" }];
const STATUS = [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }];
const VISIBILITY = [{ value: "public", label: "Public" }, { value: "participants", label: "Participants & staff" }, { value: "staff", label: "Staff only" }];

export default async function AnnouncementsPage(props: PageProps<"/staff/announcements">) {
  const session = await requireStaff();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  const [{ data: announcements }, { data: schedule }] = await Promise.all([
    supabase.from("announcements").select("*").order("created_at", { ascending: false }).returns<Announcement[]>(),
    supabase.from("event_schedule").select("*").order("starts_at").returns<ScheduleItem[]>(),
  ]);

  if (!isAdmin(session)) {
    return (
      <>
        <PageHeader title="Announcements & Schedule" />
        <div className="grid gap-6 lg:grid-cols-2">
          <AnnouncementFeed items={(announcements ?? []).filter((a) => a.status === "published")} timeZone={tz} />
          <ScheduleList items={schedule ?? []} timeZone={tz} now={requestTime()} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Announcements & Schedule" description={`Times are in the event time zone (${tz}). Important announcements notify every team in the portal.`} />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4" aria-labelledby="ann-h">
          <h2 id="ann-h" className="text-lg font-semibold text-white">Announcements</h2>
          <Card>
            <CardTitle>New announcement</CardTitle>
            <AnnouncementForm />
          </Card>
          {!announcements?.length ? <EmptyState title="No announcements" /> : announcements.map((a) => (
            <Card key={a.id}>
              <CardTitle
                description={`${a.status === "published" ? `Published ${formatDateTime(a.published_at, tz)}` : a.status} · audience: ${a.audience}`}
                actions={<>{a.is_important && <Badge tone="violet">Important</Badge>}<Badge tone={a.status === "published" ? "green" : a.status === "archived" ? "neutral" : "amber"}>{a.status}</Badge></>}
              >
                {a.title}
              </CardTitle>
              <details>
                <summary className="cursor-pointer text-sm text-violet-300">Edit</summary>
                <div className="mt-3"><AnnouncementForm item={a} /></div>
                <form action={deleteAnnouncement.bind(null, a.id)} className="mt-3">
                  <ConfirmSubmit variant="danger" size="sm" message="Delete this announcement?">Delete</ConfirmSubmit>
                </form>
              </details>
            </Card>
          ))}
        </section>
        <section className="space-y-4" aria-labelledby="sch-h">
          <h2 id="sch-h" className="text-lg font-semibold text-white">Schedule</h2>
          <Card>
            <CardTitle>New schedule item</CardTitle>
            <ScheduleForm tz={tz} />
          </Card>
          {!schedule?.length ? <EmptyState title="No schedule items" /> : schedule.map((s) => (
            <Card key={s.id}>
              <CardTitle description={`${formatDateTime(s.starts_at, tz)}${s.venue ? ` · ${s.venue}` : ""}`} actions={<Badge>{s.visibility}</Badge>}>{s.title}</CardTitle>
              <details>
                <summary className="cursor-pointer text-sm text-violet-300">Edit</summary>
                <div className="mt-3"><ScheduleForm item={s} tz={tz} /></div>
                <form action={deleteScheduleItem.bind(null, s.id)} className="mt-3">
                  <ConfirmSubmit variant="danger" size="sm" message="Delete this schedule item?">Delete</ConfirmSubmit>
                </form>
              </details>
            </Card>
          ))}
        </section>
      </div>
    </>
  );
}

function AnnouncementForm({ item }: { item?: Announcement }) {
  const p = item ? `a-${item.id}-` : "a-new-";
  return (
    <form action={saveAnnouncement} className="space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField label="Title" name="title" id={`${p}title`} required maxLength={150} defaultValue={item?.title} />
      <TextArea label="Message" name="body" id={`${p}body`} required maxLength={10000} defaultValue={item?.body} rows={4} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Audience" name="audience" id={`${p}aud`} defaultValue={item?.audience ?? "all"} options={AUDIENCE} />
        <SelectField label="Status" name="status" id={`${p}status`} defaultValue={item?.status ?? "draft"} options={STATUS} />
      </div>
      <Checkbox name="is_important" label="Important (highlight & notify teams)" defaultChecked={item?.is_important} />
      <SubmitButton size="sm">{item ? "Save" : "Create"}</SubmitButton>
    </form>
  );
}

function ScheduleForm({ item, tz }: { item?: ScheduleItem; tz: string }) {
  const p = item ? `s-${item.id}-` : "s-new-";
  return (
    <form action={saveScheduleItem} className="space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField label="Title" name="title" id={`${p}title`} required maxLength={150} defaultValue={item?.title} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Starts" name="starts_at" id={`${p}start`} type="datetime-local" required defaultValue={toLocalInput(item?.starts_at, tz)} />
        <TextField label="Ends" name="ends_at" id={`${p}end`} type="datetime-local" defaultValue={toLocalInput(item?.ends_at, tz)} />
        <TextField label="Venue" name="venue" id={`${p}venue`} maxLength={200} defaultValue={item?.venue ?? ""} />
        <SelectField label="Visibility" name="visibility" id={`${p}vis`} defaultValue={item?.visibility ?? "public"} options={VISIBILITY} />
      </div>
      <TextArea label="Description" name="description" id={`${p}desc`} maxLength={2000} defaultValue={item?.description ?? ""} rows={2} />
      <SubmitButton size="sm">{item ? "Save" : "Add"}</SubmitButton>
    </form>
  );
}
