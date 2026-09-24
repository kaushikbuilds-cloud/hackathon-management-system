"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, CardTitle, buttonClass } from "@/components/ui";

type Issue = { participantCode?: string; message: string };

export function GeneratePanel({ teamId, fileName, pageCount, blocked, hasGenerated }: { teamId: string; fileName: string; pageCount: number; blocked: boolean; hasGenerated: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: "idle" | "working" | "done" | "error"; message?: string; issues?: Issue[]; url?: string }>({ status: "idle" });

  async function generate() {
    setState({ status: "working" });
    try {
      const res = await fetch(`/api/teams/${teamId}/id-cards`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", message: body.error ?? `Generation failed (HTTP ${res.status}).`, issues: body.issues });
      } else {
        setState({ status: "done", message: `Generated ${body.pageCount} page(s).`, url: body.downloadUrl });
        // Trigger the download using the short-lived signed URL.
        const a = document.createElement("a");
        a.href = body.downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      setState({ status: "error", message: "Network error. Check your connection and retry." });
    }
    router.refresh();
  }

  return (
    <Card className="lg:sticky lg:top-20">
      <CardTitle description={`${pageCount} page(s) · ${fileName}`}>Generate</CardTitle>
      <div className="space-y-3">
        <a
          href={blocked ? undefined : `/api/teams/${teamId}/id-cards/preview`}
          target="_blank"
          rel="noopener"
          aria-disabled={blocked}
          className={buttonClass("secondary", "md", `w-full ${blocked ? "pointer-events-none opacity-50" : ""}`)}
        >
          Preview PDF
        </a>
        <Button type="button" className="w-full" onClick={generate} disabled={blocked || state.status === "working"} aria-busy={state.status === "working"}>
          {state.status === "working" ? "Generating…" : hasGenerated ? "Regenerate & Download PDF" : "Generate & Download PDF"}
        </Button>
        {hasGenerated && (
          <a href={`/api/teams/${teamId}/id-cards/latest`} className={buttonClass("ghost", "sm", "w-full")}>Download last generated PDF</a>
        )}
        <div aria-live="polite">
          {blocked && <Alert tone="red">Resolve the data errors to enable generation.</Alert>}
          {state.status === "done" && (
            <Alert tone="green" title="PDF ready">
              {state.message}{" "}
              {state.url && <a href={state.url} download={fileName} className="underline">Download again</a>}
              {" · "}Print at 100% scale (no “fit to page”).
            </Alert>
          )}
          {state.status === "error" && (
            <Alert tone="red" title="Generation failed">
              <p>{state.message}</p>
              {state.issues && <ul className="mt-1 list-disc pl-5">{state.issues.map((i, n) => <li key={n}>{i.participantCode && `${i.participantCode}: `}{i.message}</li>)}</ul>}
              <button type="button" onClick={generate} className="mt-2 font-semibold underline">Retry</button>
            </Alert>
          )}
        </div>
      </div>
    </Card>
  );
}
