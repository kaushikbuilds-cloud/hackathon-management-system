import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/icons";
import { Card } from "@/components/ui";
import { PLATFORM } from "@/lib/platform";

export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3 font-heading text-3xl font-bold text-ink [text-shadow:3px_3px_0_var(--color-line)]">
          <LogoMark className="size-11" />
          {PLATFORM.name}
        </Link>
        <Card className="p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-pop [text-shadow:2px_2px_0_var(--color-line)]">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <div className="panel mt-6 rounded-lg border-2 border-line p-4 text-center text-sm text-ink-soft [&_a]:font-bold [&_a]:text-pop [&_a]:underline-offset-4 [&_a:hover]:underline">{footer}</div>}
      </div>
    </main>
  );
}
