import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { StaffDirectory } from "../staff-directory";

export const metadata: Metadata = { title: "Officials" };

export default async function OfficialsPage(props: PageProps<"/staff/users/officials">) {
  const session = await requirePermission("manage_officials");
  return <StaffDirectory session={session} role="official" searchParams={await props.searchParams} />;
}
