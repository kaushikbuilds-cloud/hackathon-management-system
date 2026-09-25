import { ProfileSecurity } from "@/components/profile-security";
import { Flash, PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PortalProfilePage(props: PageProps<"/portal/profile">) {
  const session = await requireParticipant();
  const sp = await props.searchParams;
  const { data: me } = await (await createClient()).from("participants").select("participant_code").eq("id", session.participantId).maybeSingle<{ participant_code: string }>();
  return (
    <>
      <PageHeader title="Profile & Security" />
      <Flash notice={sp.notice} error={sp.error} />
      <ProfileSecurity session={session} extra={me ? [{ label: "Participant ID", value: <span className="font-mono">{me.participant_code}</span> }] : []} />
    </>
  );
}
