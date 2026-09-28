import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/icons";
import { Card } from "@/components/ui";
import { PLATFORM } from "@/lib/platform";

export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3 text-2xl font-bold tracking-tight text-ink">
          <LogoMark className="size-10" />
          {PLATFORM.name}
        </Link>
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <div className="mt-6 text-center text-sm text-muted [&_a]:font-semibold [&_a]:text-grass [&_a]:underline-offset-4 [&_a:hover]:underline">{footer}</div>}
      </div>
    </main>
  );
}
