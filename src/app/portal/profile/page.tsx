import { ProfileSecurity } from "@/components/profile-security";
import { Flash, PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PortalProfilePage(props: PageProps<"/portal/profile">) {
  const session = await requireParticipant();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data: me } = session.participantId
    ? await supabase.from("participants").select("participant_code").eq("id", session.participantId).maybeSingle<{ participant_code: string }>()
    : { data: null };
  const { data: team } = session.isTeamAccount
    ? await supabase.from("teams").select("name, team_code").eq("id", session.profile.team_id!).maybeSingle<{ name: string; team_code: string }>()
    : { data: null };
  return (
    <>
      <PageHeader title="Profile & Security" />
      <Flash notice={sp.notice} error={sp.error} />
      <ProfileSecurity session={session} extra={[
        ...(team ? [{ label: "Team", value: team.name }, { label: "Team ID (sign-in)", value: <span className="font-mono">{team.team_code}</span> }] : []),
        ...(me ? [{ label: "Participant ID", value: <span className="font-mono">{me.participant_code}</span> }] : []),
      ]} />
    </>
  );
}
