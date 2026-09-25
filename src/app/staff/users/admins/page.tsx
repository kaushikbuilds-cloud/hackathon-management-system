import type { Metadata } from "next";
import { requireHackathon, requireSuperAdmin } from "@/lib/auth";
import { StaffDirectory } from "../staff-directory";

export const metadata: Metadata = { title: "Admins" };

export default async function AdminsPage(props: PageProps<"/staff/users/admins">) {
  const session = requireHackathon(await requireSuperAdmin());
  return <StaffDirectory session={session} role="admin" searchParams={await props.searchParams} />;
}
