import { redirect } from "next/navigation";
import { isStaff, requireSession } from "@/lib/auth";
import { isQrToken } from "@/lib/domain/ids";

/**
 * Target of the URL encoded in ID-card QR codes. Only signed-in staff can
 * resolve it (in the attendance scanner); everyone else sees nothing personal.
 */
export default async function VerifyPage(props: PageProps<"/verify/[token]">) {
  const { token } = await props.params;
  const session = await requireSession();
  if (!isStaff(session)) {
    return (
      <main id="main" className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-bold text-white">Participant verification</h1>
          <p className="mt-2 text-slate-400">This code can only be verified by event officials.</p>
        </div>
      </main>
    );
  }
  redirect(isQrToken(token) ? `/staff/attendance?token=${token}` : "/staff/attendance");
}
