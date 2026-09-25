import type { Metadata } from "next";
import { ProfileSecurity } from "@/components/profile-security";
import { Flash, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile & Security" };

export default async function SettingsPage(props: PageProps<"/staff/settings">) {
  const session = await requireStaff();
  const sp = await props.searchParams;
  return (
    <>
      <PageHeader title="Profile & Security" />
      <Flash notice={sp.notice} error={sp.error} />
      <ProfileSecurity session={session} />
    </>
  );
}
