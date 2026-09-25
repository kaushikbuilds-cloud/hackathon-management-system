"use client";

import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, inputClass } from "@/components/ui";
import type { MealServeResult } from "@/lib/types";
import { searchPeople, serveByPick, serveByScan, type PickResult } from "../actions";

const LOOK: Record<MealServeResult["state"], { bg: string; title: (r: MealServeResult) => string }> = {
  served: { bg: "bg-pop", title: () => "Served ✓" },
  already: { bg: "bg-warn-tint", title: (r) => `Already had ${r.meal ?? "this meal"}` },
  closed: { bg: "bg-paper-2", title: () => "Serving is closed" },
  rejected: { bg: "bg-danger-tint", title: () => "Not allowed" },
  invalid: { bg: "bg-danger-tint", title: () => "Card not valid" },
};

/**
 * Counter scanner: every scan records a serving straight away (one per person
 * per meal). Works with the phone camera, a handheld scanner typing into the
 * code box, or a name search when a card is missing.
 */
export function MealScanner({ mealId, open }: { mealId: string; open: boolean }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScan = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<MealServeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PickResult[]>([]);

  const show = useCallback((r: MealServeResult) => {
    setResult(r);
    navigator.vibrate?.(r.state === "served" ? [60] : [200, 80, 200]);
    router.refresh();
  }, [router]);

  const scan = useCallback(async (text: string) => {
    setBusy(true);
    try {
      show(await serveByScan(mealId, text));
    } catch {
      setResult({ state: "invalid", message: "Could not reach the server. Scan again." });
    } finally {
      setBusy(false);
    }
  }, [mealId, show]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!scanning) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const qr = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
          const now = Date.now();
          if (qr?.data && (qr.data !== lastScan.current.text || now - lastScan.current.at > 4000)) {
            lastScan.current = { text: qr.data, at: now };
            void scan(qr.data);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scanning, scan]);

  async function start() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not available in this browser. Use the code box or name search.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
    } catch {
      setCameraError("Could not start the camera. Allow camera access, or use the code box or name search.");
    }
  }

  async function search(value: string) {
    setQuery(value);
    setMatches(value.trim().length >= 2 ? await searchPeople(value) : []);
  }

  const look = result ? LOOK[result.state] : null;

  if (!open) {
    return <p className="rounded-md border-2 border-dashed border-line p-4 text-sm text-ink-soft">Start serving to scan cards for this meal.</p>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="relative aspect-square overflow-hidden rounded-md border-2 border-line bg-ink shadow-brutal">
          <video ref={videoRef} className={`size-full object-cover ${scanning ? "" : "hidden"}`} muted playsInline aria-label="Camera preview" />
          {!scanning && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-bold text-paper">Camera is off</div>}
          {scanning && <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-line" aria-hidden="true" />}
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="mt-3">
          {scanning ? <Button variant="secondary" onClick={stop}>Stop camera</Button> : <Button onClick={start}>Start camera</Button>}
        </div>
        {cameraError && <p className="mt-3 text-sm font-bold text-danger" role="alert">{cameraError}</p>}
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void scan(code.trim()).then(() => setCode(""));
          }}
        >
          <label htmlFor="meal-code" className="sr-only">Scanned code</label>
          <input id="meal-code" value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} placeholder="Handheld scanner / pasted code" autoComplete="off" />
          <Button type="submit" variant="secondary" disabled={busy}>Serve</Button>
        </form>
        <div className="mt-4">
          <label htmlFor="meal-search" className="block text-sm font-bold text-ink">No card? Find by name or Participant ID</label>
          <input id="meal-search" value={query} onChange={(e) => void search(e.target.value)} className={`${inputClass} mt-1.5`} autoComplete="off" placeholder="e.g. Priya or SAMPLE1-P0003" />
          {matches.length > 0 && (
            <ul className="mt-2 divide-y-2 divide-line-soft rounded-md border-2 border-line bg-surface">
              {matches.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <span><strong>{m.full_name}</strong> <span className="font-mono text-xs text-muted">{m.participant_code}</span> · {m.team_name}</span>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={async () => {
                    setBusy(true);
                    try { show(await serveByPick(mealId, m.id)); } finally { setBusy(false); }
                    setQuery("");
                    setMatches([]);
                  }}>Serve</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div aria-live="assertive" className="space-y-3">
        {busy && <p className="text-sm text-muted">Checking…</p>}
        {!result && !busy && <p className="text-sm text-muted">Scan an ID card. The result shows here in big letters.</p>}
        {result && look && (
          <div className={`rounded-lg border-2 border-line p-6 shadow-brutal ${look.bg}`}>
            <p className="font-heading text-4xl font-bold text-ink">{look.title(result)}</p>
            {result.participant && (
              <div className="mt-3">
                <p className="text-2xl font-bold text-ink">{result.participant.full_name}</p>
                <p className="text-sm text-ink"><span className="font-mono">{result.participant.participant_code}</span> · Team {result.participant.team_name}</p>
              </div>
            )}
            {result.state === "already" && result.served_at && (
              <p className="mt-2 text-sm font-bold text-ink">Served at {new Date(result.served_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. Do not serve again.</p>
            )}
            {result.message && <p className="mt-2 text-sm text-ink">{result.message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
