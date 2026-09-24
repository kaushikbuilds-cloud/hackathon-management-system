import { requestTime } from "@/lib/format";
import { AnnouncementFeed, ScheduleList } from "@/components/announcements";
import { PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadAnnouncementsAndSchedule } from "@/lib/data/portal";

export default async function PortalSchedulePage() {
  await requireParticipant();
  const [hackathon, feed] = await Promise.all([getHackathon(), loadAnnouncementsAndSchedule()]);
  const tz = hackathon?.timezone ?? "UTC";
  return (
    <>
      <PageHeader title="Announcements & Schedule" description={`Times shown in ${tz}.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AnnouncementFeed items={feed.announcements} timeZone={tz} />
        <ScheduleList items={feed.schedule} timeZone={tz} now={requestTime()} />
      </div>
    </>
  );
}
