import { SubmitButton } from "@/components/client";
import { Card, Flash, PageHeader, TextField } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createForm } from "../actions";

export default async function NewFormPage(props: PageProps<"/staff/forms/new">) {
  await requirePermission("manage_registrations");
  const sp = await props.searchParams;
  return (
    <>
      <PageHeader back={{ href: "/staff/forms", label: "Form Builder" }} title="New registration form" />
      <Flash notice={sp.notice} error={sp.error} />
      <Card className="max-w-xl">
        <form action={createForm} className="space-y-4">
          <TextField label="Title" name="title" required maxLength={150} placeholder="Team Registration" />
          <TextField label="URL slug" name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="team-registration" hint="Public URL: /register/<slug>" />
          <SubmitButton>Create draft</SubmitButton>
        </form>
      </Card>
    </>
  );
}
