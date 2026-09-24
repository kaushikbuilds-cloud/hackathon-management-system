"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";

/** Generates PDFs team-by-team (sequentially, so each request stays small and failures are isolated). */
export function BulkGenerate({ teams }: { teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; failed: string[]; running: boolean } | null>(null);
  async function run() {
    const failed: string[] = [];
    setProgress({ done: 0, failed, running: true });
    for (let i = 0; i < teams.length; i++) {
      try {
        const res = await fetch(`/api/teams/${teams[i].id}/id-cards`, { method: "POST" });
        if (!res.ok) failed.push(teams[i].name);
      } catch {
        failed.push(teams[i].name);
      }
      setProgress({ done: i + 1, failed: [...failed], running: i + 1 < teams.length });
    }
    router.refresh();
  }
  if (teams.length === 0) return null;
  return (
    <div className="space-y-3">
      <Button onClick={run} disabled={progress?.running}>
        {progress?.running ? `Generating ${progress.done}/${teams.length}…` : `Generate ${teams.length} pending PDF(s)`}
      </Button>
      <div aria-live="polite">
        {progress && !progress.running && (
          progress.failed.length ? (
            <Alert tone="amber" title={`${progress.done - progress.failed.length} generated, ${progress.failed.length} failed`}>
              Failed: {progress.failed.join(", ")}. Open each team to see the reason and retry.
            </Alert>
          ) : (
            <Alert tone="green">All {progress.done} PDF(s) generated. Download them from each team row.</Alert>
          )
        )}
      </div>
    </div>
  );
}
