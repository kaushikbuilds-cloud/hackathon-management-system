import { PageHeader } from "@/components/ui";
import { requireParticipant } from "@/lib/auth";
import { loadMyTeam } from "@/lib/data/portal";
import { NewRequestForm } from "./new-request-form";

export default async function NewSupportRequestPage() {
  const session = await requireParticipant();
  const data = await loadMyTeam();
  return (
    <>
      <PageHeader back={{ href: "/portal/support", label: "Help & Support" }} title="New support request" />
      <NewRequestForm team={data ? `${data.team.name} (${data.team.team_code})` : ""} email={session.email ?? ""} />
    </>
  );
}
