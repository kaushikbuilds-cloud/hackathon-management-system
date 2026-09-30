import { SubmitButton } from "@/components/client";
import { Alert, Card, Flash, PageHeader, TextField } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getHackathon, hackathonEnded } from "@/lib/data/event";
import { createForm } from "../actions";

export default async function NewFormPage(props: PageProps<"/staff/forms/new">) {
  await requirePermission("manage_registrations");
  const sp = await props.searchParams;
  const hackathon = await getHackathon();
  const ended = hackathonEnded(hackathon);
  return (
    <>
      <PageHeader back={{ href: "/staff/forms", label: "Form Builder" }} title="New registration form" />
      <Flash notice={sp.notice} error={sp.error} />
      <div className="mb-4 max-w-xl">
        {ended
          ? <Alert tone="amber" title={`${hackathon?.name} has ended`}>New forms can&apos;t be created here. To take registrations for a new hackathon, open it first from Hackathons.</Alert>
          : <Alert tone="blue" title={`For ${hackathon?.name ?? "this hackathon"}`}>Teams who register with this form join {hackathon?.name ?? "this hackathon"}.</Alert>}
      </div>
      <Card className="max-w-xl">
        <form action={createForm} className="space-y-4">
          <TextField label="Title" name="title" required maxLength={150} placeholder="Team Registration" />
          <TextField label="URL slug" name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="team-registration" hint="Public URL: /register/<slug>" />
          <SubmitButton disabled={ended}>Create draft</SubmitButton>
        </form>
      </Card>
    </>
  );
}
