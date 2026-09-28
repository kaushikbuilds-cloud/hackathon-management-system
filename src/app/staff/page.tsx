import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/bar-list";
import { ColumnChart, RingChart, STATUS_COLORS, ShareBars } from "@/components/charts";
import { Countdown } from "@/components/countdown";
import { Icon, type IconName } from "@/components/icons";
import { RegistrationBadge } from "@/components/status";
import { Badge, Card, CardTitle, DescriptionList, LinkButton, PageHeader, Stat, Table, Td, Th, buttonClass, cx } from "@/components/ui";
import { can, isSuperAdmin, portalName, requireStaff, type Session } from "@/lib/auth";
import { getHackathon } from "@/lib/data/event";
import { loadDashboardStats } from "@/lib/data/stats";
import { HACKATHON_STATUS_LABEL, loadPlatformOverview } from "@/lib/data/platform";
import { PDF_STATUS_LABEL, TEAM_ATTENDANCE_LABEL } from "@/lib/domain/labels";
import { SUPPORT_STATUSES, supportStatusLabel } from "@/lib/domain/support";
import { formatDateTime, requestTime } from "@/lib/format";
import { permissionLabel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { RegistrationStatus } from "@/lib/domain/labels";
import type { Hackathon, OfficialAssignment } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

const SUPPORT_LABELS = Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, supportStatusLabel(s)]));

export default async function DashboardPage() {
  const session = await requireStaff();
  if (isSuperAdmin(session) && !session.hackathonId) return <PlatformDashboard />;
  const hackathon = await getHackathon();
  const tz = hackathon?.timezone ?? "UTC";
  return (
    <>
      <h1 className="sr-only">Dashboard</h1>
      <Hero session={session} hackathon={hackathon} tz={tz} />
      {can(session, "view_reports") ? <Overview session={session} tz={tz} superAdmin={isSuperAdmin(session)} tracks={hackathon?.tracks ?? []} /> : <WorkDashboard session={session} tz={tz} />}
    </>
  );
}

function greeting(tz: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(requestTime()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** Greeting banner with the event countdown beside it. */
function Hero({ session, hackathon, tz }: { session: Session; hackathon: Hackathon | null; tz: string }) {
  const first = (session.profile.full_name ?? "").trim().split(/\s+/)[0] || "there";
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
      <div className="panel rounded-lg border border-line p-5">
        <p className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{greeting(tz)}, {first}</p>
        <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
          {hackathon ? <>Everything for <strong className="text-ink">{hackathon.name}</strong> in one place. {hackathon.tagline ?? "Let's build something amazing!"}</> : "Open a hackathon to see its dashboard."}
        </p>
        <p className="mt-4"><Badge tone="violet">{portalName(session)}</Badge></p>
      </div>
      {hackathon && <div className="lg:w-96"><Countdown startsAt={hackathon.starts_at} endsAt={hackathon.ends_at} now={requestTime()} /></div>}
    </div>
  );
}

/** Platform owner's view: usage across all hackathons (no event data). */
async function PlatformDashboard() {
  const rows = await loadPlatformOverview(await createClient());
  const sum = (k: "teams" | "participants" | "staff" | "present" | "open_support") => rows.reduce((n, r) => n + r[k], 0);
  const byStatus = Object.keys(HACKATHON_STATUS_LABEL).map((k) => ({ label: k, value: rows.filter((r) => r.status === k).length }));
  const count = (status: string) => byStatus.find((b) => b.label === status)?.value ?? 0;
  const recent = [...rows].filter((r) => r.last_activity).sort((a, b) => (b.last_activity ?? "").localeCompare(a.last_activity ?? "")).slice(0, 8);
  return (
    <>
      <PageHeader title="Platform Dashboard" description="Usage across every hackathon on the platform."
        actions={<LinkButton href="/staff/hackathons">Manage hackathons</LinkButton>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Hackathons" value={rows.length} hint={`${count("active")} active · ${count("setup")} setting up`} />
        <Stat label="Teams" value={sum("teams")} tone="violet" />
        <Stat label="Participants" value={sum("participants")} tone="green" hint={`${sum("present")} checked in`} />
        <Stat label="Staff accounts" value={sum("staff")} tone="amber" hint={`${sum("open_support")} open support requests`} />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card><CardTitle>Hackathons by status</CardTitle><BarList items={byStatus} labels={HACKATHON_STATUS_LABEL} /></Card>
        <Card><CardTitle>Teams per hackathon</CardTitle><BarList items={[...rows].sort((a, b) => b.teams - a.teams).map((r) => ({ label: r.name, value: r.teams }))} /></Card>
      </div>
      <Card className="mt-6">
        <CardTitle>Recently active</CardTitle>
        {recent.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
          <ul className="divide-y divide-line-soft text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2">
                <Link href={`/staff/hackathons/${r.id}`} className="text-ink hover:underline">{r.name}</Link>
                <span className="text-xs text-muted">{formatDateTime(r.last_activity)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

type RecentTeam = { id: string; name: string; team_code: string; status: RegistrationStatus; college: string | null; track: string | null; created_at: string; participants: { full_name: string; role: string }[] };

/** Registrations per day for the last 30 days, in the event's time zone. */
async function registrationsByDay(supabase: Awaited<ReturnType<typeof createClient>>, tz: string) {
  const days = 30;
  const since = new Date(requestTime() - days * 86_400_000).toISOString();
  const { data } = await supabase.from("teams").select("created_at").gte("created_at", since).limit(10000).returns<{ created_at: string }[]>();
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" });
  const counts = new Map<string, number>();
  for (const t of data ?? []) { const k = key.format(new Date(t.created_at)); counts.set(k, (counts.get(k) ?? 0) + 1); }
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(requestTime() - (days - 1 - i) * 86_400_000);
    return { label: label.format(d), value: counts.get(key.format(d)) ?? 0 };
  });
}

const QUICK_ACTIONS: { href: string; label: string; icon: IconName; tone: string; show: (s: Session) => boolean }[] = [
  { href: "/staff/teams", label: "Review teams", icon: "users", tone: "bg-brand-tint text-brand", show: (s) => can(s, "view_participants") || can(s, "manage_registrations") },
  { href: "/staff/attendance", label: "Scan ID cards", icon: "qr", tone: "bg-sky-tint text-sky-ink", show: (s) => can(s, "record_attendance") },
  { href: "/staff/id-cards", label: "Generate ID cards", icon: "idcard", tone: "bg-brand-tint text-brand", show: (s) => can(s, "generate_pdf") || can(s, "manage_event") },
  { href: "/staff/announcements", label: "Post announcement", icon: "megaphone", tone: "bg-warn-tint text-warn", show: (s) => can(s, "publish_announcements") },
  { href: "/staff/reports", label: "View reports", icon: "chart", tone: "bg-ok-tint text-ok", show: (s) => can(s, "view_reports") },
  { href: "/staff/event", label: "Event settings", icon: "settings", tone: "bg-paper-2 text-ink-soft", show: (s) => can(s, "manage_event") },
];

async function Overview({ session, tz, superAdmin, tracks }: { session: Session; tz: string; superAdmin: boolean; tracks: string[] }) {
  const supabase = await createClient();
  const [stats, daily, { data: recent }, { data: trackRows }] = await Promise.all([
    loadDashboardStats(supabase),
    registrationsByDay(supabase, tz),
    supabase.from("teams").select("id, name, team_code, status, college, track, created_at, participants(full_name, role)")
      .order("created_at", { ascending: false }).limit(5).returns<RecentTeam[]>(),
    tracks.length ? supabase.from("teams").select("track").neq("status", "rejected").limit(10000).returns<{ track: string | null }[]>() : Promise.resolve({ data: [] as { track: string | null }[] }),
  ]);
  const trackCounts = new Map<string, number>();
  for (const r of trackRows ?? []) { const k = r.track ?? ""; trackCounts.set(k, (trackCounts.get(k) ?? 0) + 1); }
  const distribution = [
    ...tracks.map((t) => ({ label: t, value: trackCounts.get(t) ?? 0 })),
    ...[...trackCounts].filter(([k]) => k && !tracks.includes(k)).map(([label, value]) => ({ label, value })),
    ...(trackCounts.get("") ? [{ label: "No track yet", value: trackCounts.get("") ?? 0 }] : []),
  ];
  const byStatus = Object.fromEntries(stats.registration.map((r) => [r.label, r.value]));
  const ring = [
    { label: "Approved", value: byStatus.approved ?? 0, color: STATUS_COLORS.approved },
    { label: "Pending", value: byStatus.pending ?? 0, color: STATUS_COLORS.pending },
    { label: "Rejected", value: byStatus.rejected ?? 0, color: STATUS_COLORS.rejected },
    ...(byStatus.flagged ? [{ label: "Flagged", value: byStatus.flagged, color: "#6366f1" }] : []),
  ];
  const last30 = daily.reduce((n, d) => n + d.value, 0);
  const actions = QUICK_ACTIONS.filter((a) => a.show(session));
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Icon name="users" className="size-5" />} tone="green" label="Registered teams" value={stats.teams} hint={stats.pendingApprovals ? <Link href="/staff/teams?status=pending" className="underline">{stats.pendingApprovals} pending approval</Link> : "No pending approvals"} />
        <Stat icon={<Icon name="user" className="size-5" />} tone="blue" label="Participants" value={stats.participants} hint={`${last30} teams in the last 30 days`} />
        <Stat icon={<Icon name="check" className="size-5" />} tone="violet" label="Checked in" value={`${stats.present}/${stats.participants}`} hint={stats.participants ? `${Math.round((stats.present / stats.participants) * 100)}% attendance` : undefined} />
        <Stat icon={<Icon name="help" className="size-5" />} tone="amber" label="Open support requests" value={stats.openSupport} hint={<Link href="/staff/support" className="underline">View queue</Link>} />
      </div>
      {superAdmin && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<Icon name="shield" className="size-5" />} tone="amber" label="Active staff" value={stats.staff} hint={<Link href="/staff/users/admins" className="underline">User Management</Link>} />
          <Stat icon={<Icon name="mail" className="size-5" />} tone="violet" label="Pending invitations" value={stats.pendingInvitations} />
        </div>
      )}

      <div className={cx("mt-6 grid gap-6", tracks.length ? "xl:grid-cols-2 2xl:grid-cols-[1.5fr_1fr_1fr]" : "xl:grid-cols-[1.4fr_1fr]")}>
        <Card className={tracks.length ? "xl:col-span-2 2xl:col-span-1" : undefined}>
          <CardTitle description="New teams per day, last 30 days. Hover a bar for the exact number.">Registrations over time</CardTitle>
          <ColumnChart data={daily} label="Team registrations per day, last 30 days" unit="teams" />
        </Card>
        <Card>
          <CardTitle>Registration status</CardTitle>
          <RingChart segments={ring} total={stats.teams} totalLabel="Teams" />
        </Card>
        {tracks.length > 0 && (
          <Card>
            <CardTitle description="Teams per track (rejected teams not counted).">Team distribution</CardTitle>
            <ShareBars items={distribution} />
          </Card>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardTitle actions={<LinkButton href="/staff/teams" variant="secondary" size="sm">View all</LinkButton>}>Recent registrations</CardTitle>
          {!recent?.length ? <p className="text-sm text-muted">No teams yet.</p> : (
            <Table caption="The five most recent team registrations">
              <thead><tr><Th>Team</Th><Th>Leader</Th><Th>Members</Th>{tracks.length > 0 && <Th>Track</Th>}<Th>Status</Th><Th>Registered</Th></tr></thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <Td><Link href={`/staff/teams/${t.id}`} className="font-bold text-grass hover:underline">{t.name}</Link><span className="block font-mono text-xs text-muted">{t.team_code}</span></Td>
                    <Td>{t.participants.find((m) => m.role === "leader")?.full_name ?? "—"}</Td>
                    <Td className="tabular-nums">{t.participants.length}</Td>
                    {tracks.length > 0 && <Td className="whitespace-nowrap">{t.track ?? <span className="text-muted">—</span>}</Td>}
                    <Td><RegistrationBadge status={t.status} /></Td>
                    <Td className="whitespace-nowrap text-ink-soft">{formatDateTime(t.created_at, tz)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardTitle>Quick actions</CardTitle>
          <ul className="space-y-2">
            {actions.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="group flex min-h-12 items-center gap-3 rounded-md border border-line px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-paper">
                  <span className={cx("grid size-8 place-items-center rounded-md", a.tone)} aria-hidden="true"><Icon name={a.icon} className="size-4" /></span>
                  <span className="flex-1">{a.label}</span>
                  <Icon name="arrowRight" className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card><CardTitle>Team attendance</CardTitle><BarList items={stats.teamAttendance} labels={TEAM_ATTENDANCE_LABEL} /></Card>
        <Card><CardTitle>ID card PDF jobs</CardTitle><BarList items={stats.pdf} labels={PDF_STATUS_LABEL} /></Card>
        <Card><CardTitle>Support requests</CardTitle><BarList items={stats.support} labels={SUPPORT_LABELS} /></Card>
        <Card><CardTitle>Teams by college</CardTitle><BarList items={stats.teamsByCollege} /></Card>
        <Card><CardTitle>Participants by department</CardTitle><BarList items={stats.participantsByDepartment} /></Card>
        {stats.recentActivity.length > 0 && (
          <Card>
            <CardTitle actions={superAdmin && <LinkButton href="/staff/audit" variant="secondary" size="sm">Audit Logs</LinkButton>}>Recent activity</CardTitle>
            <ul className="divide-y divide-line-soft text-sm">
              {stats.recentActivity.slice(0, 8).map((a, i) => (
                <li key={i} className="flex justify-between gap-3 py-2"><span className="font-mono text-xs text-ink">{a.action}</span><span className="text-xs whitespace-nowrap text-muted">{formatDateTime(a.at, tz)}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

/** Dashboard for staff without report access (typically Officials): duties and quick actions. */
async function WorkDashboard({ session, tz }: { session: Session; tz: string }) {
  const supabase = await createClient();
  const since = new Date(requestTime() - 24 * 3600_000).toISOString();
  const [{ data: assignment }, { count: myCheckins }, { count: myRequests }] = await Promise.all([
    supabase.from("official_assignments").select("*").eq("profile_id", session.userId).maybeSingle<OfficialAssignment>(),
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("recorded_by", session.userId).gte("checked_in_at", since),
    supabase.from("support_requests").select("id", { count: "exact", head: true }).eq("assigned_to", session.userId).not("status", "in", "(resolved,closed)"),
  ]);
  const actions = [
    { href: "/staff/attendance", label: "Scan QR codes", show: can(session, "record_attendance") },
    { href: "/staff/attendance/manual", label: "Manual check-in", show: can(session, "manual_checkin") },
    { href: "/staff/attendance/history", label: "My check-in history", show: true },
    { href: "/staff/support", label: "Help desk", show: true },
    { href: "/staff/id-cards", label: "ID cards", show: can(session, "generate_pdf") },
  ].filter((a) => a.show);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Your assignment</CardTitle>
        <DescriptionList items={[
          { label: "Duty", value: assignment?.duty ?? "Not assigned yet" },
          { label: "Station", value: assignment?.station ?? "—" },
          { label: "Permissions", value: [...session.permissions].map(permissionLabel).join(", ") || "None" },
          { label: "Signed in as", value: session.email },
        ]} />
      </Card>
      <div className="grid grid-cols-2 gap-4 content-start">
        <Stat label="Your check-ins (24 h)" value={myCheckins ?? 0} tone="green" />
        <Stat label="Your open help-desk requests" value={myRequests ?? 0} tone="amber" />
      </div>
      <Card className="lg:col-span-2">
        <CardTitle>Quick actions</CardTitle>
        <div className="flex flex-wrap gap-3">
          {actions.map((a) => <Link key={a.href} href={a.href} className={buttonClass(a.href === "/staff/attendance" ? "primary" : "secondary")}>{a.label}</Link>)}
        </div>
        <p className="mt-4 text-xs text-muted">Times shown in {tz}.</p>
      </Card>
    </div>
  );
}
