import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { StaffDirectory } from "../staff-directory";

export const metadata: Metadata = { title: "Admins" };

export default async function AdminsPage(props: PageProps<"/staff/users/admins">) {
  const session = await requireSuperAdmin();
  return <StaffDirectory session={session} role="admin" searchParams={await props.searchParams} />;
}
