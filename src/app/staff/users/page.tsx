import { redirect } from "next/navigation";
import { can, isSuperAdmin, requireStaff } from "@/lib/auth";

export default async function UsersIndex() {
  const session = await requireStaff();
  if (isSuperAdmin(session)) redirect("/staff/users/admins");
  if (can(session, "manage_officials")) redirect("/staff/users/officials");
  redirect("/staff/forbidden");
}
