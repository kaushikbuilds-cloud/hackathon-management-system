import { EmptyState, LinkButton } from "@/components/ui";

export default function ForbiddenPage() {
  return (
    <EmptyState title="You don't have access to this page" action={<LinkButton href="/staff/teams" variant="secondary">Go to Teams</LinkButton>}>
      Ask an administrator to grant the required permission.
    </EmptyState>
  );
}
