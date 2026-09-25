import { SubmitButton } from "@/components/client";
import { Card, CardTitle, DescriptionList, LinkButton, TextField } from "@/components/ui";
import type { Session } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { permissionLabel } from "@/lib/permissions";
import { updateOwnProfile } from "@/lib/profile/actions";

export function ProfileSecurity({ session, extra }: { session: Session; extra?: { label: string; value: React.ReactNode }[] }) {
  const p = session.profile;
  const perms = p.role === "super_admin" ? "All permissions" : p.role === "participant" ? null : [...session.permissions].map(permissionLabel).join(", ") || "None";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Profile</CardTitle>
        <form action={updateOwnProfile} className="space-y-4">
          <TextField label="Full name" name="full_name" defaultValue={p.full_name ?? ""} required maxLength={100} />
          <TextField label="Phone" name="phone" type="tel" defaultValue={p.phone ?? ""} maxLength={20} />
          <SubmitButton size="sm">Save profile</SubmitButton>
        </form>
      </Card>
      <Card>
        <CardTitle actions={<LinkButton href="/change-password" variant="secondary" size="sm">Change password</LinkButton>}>Security</CardTitle>
        <DescriptionList items={[
          { label: "Email (sign-in)", value: session.email },
          { label: "Role", value: ROLE_LABEL[p.role] },
          ...(perms ? [{ label: "Permissions", value: perms }] : []),
          ...(extra ?? []),
          { label: "Last sign-in", value: formatDateTime(p.last_sign_in_at) },
        ]} />
        <form action="/auth/signout" method="post" className="mt-4">
          <button type="submit" className="text-sm text-danger hover:text-danger">Sign out</button>
        </form>
      </Card>
    </div>
  );
}
