import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-bold text-white">
          <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-sm" aria-hidden="true">{"</>"}</span>
          Hackathon Portal
        </Link>
        <Card className="p-6 sm:p-8">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <div className="mt-4 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </main>
  );
}
