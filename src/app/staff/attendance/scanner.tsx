"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardTitle, inputClass } from "@/components/ui";
import { confirmCheckIn, verifyScan, type VerifyResult } from "./actions";

const STATE_UI: Record<VerifyResult["state"], { tone: "green" | "amber" | "red"; title: string }> = {
  valid: { tone: "green", title: "Valid — not yet checked in" },
  already_checked_in: { tone: "amber", title: "Already checked in" },
  revoked: { tone: "red", title: "QR code revoked" },
  invalid: { tone: "red", title: "Invalid QR code" },
};

/**
 * Camera QR scanner (getUserMedia + jsQR). Resolves the token server-side and
 * shows participant/team identity; the official must press "Confirm check-in".
 */
export function QrScanner({ initialToken }: { initialToken?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScan = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "green" | "red" | "amber"; text: string } | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const resolve = useCallback(async (text: string) => {
    setBusy(true);
    setMessage(null);
    try {
      setResult(await verifyScan(text));
    } catch {
      setMessage({ tone: "red", text: "Verification failed. Check your connection." });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Opened from a QR URL (/verify/<token>): resolve it once, without recording attendance.
    if (!initialToken) return;
    let cancelled = false;
    verifyScan(initialToken)
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setMessage({ tone: "red", text: "Verification failed. Check your connection." }));
    return () => {
      cancelled = true;
    };
  }, [initialToken]);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!scanning) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          const now = Date.now();
          if (code?.data && (code.data !== lastScan.current.text || now - lastScan.current.at > 4000)) {
            lastScan.current = { text: code.data, at: now };
            navigator.vibrate?.(60);
            void resolve(code.data);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scanning, resolve]);

  async function start() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser. Use manual entry below.");
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
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings (HTTPS is required), or use manual entry."
          : "Could not start the camera. Use manual entry below.",
      );
    }
  }

  async function checkIn() {
    if (!result?.participant) return;
    setBusy(true);
    const res = await confirmCheckIn(result.participant.id, "qr");
    setBusy(false);
    if (res.ok) {
      setMessage({ tone: "green", text: `${res.full_name} (${res.participant_code}) checked in.` });
      setResult({ ...result, state: "already_checked_in", checked_in_at: res.checked_in_at });
    } else {
      setMessage({ tone: res.code === "already_checked_in" ? "amber" : "red", text: res.message ?? "Check-in failed." });
      if (res.code === "already_checked_in") setResult({ ...result, state: "already_checked_in", checked_in_at: res.checked_in_at });
    }
  }

  const ui = result ? STATE_UI[result.state] : null;

  return (
    <Card>
      <CardTitle description="Scanning shows who the card belongs to. Attendance is recorded only when you confirm.">QR check-in</CardTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-xl border border-navy-700 bg-black">
            <video ref={videoRef} className={`size-full object-cover ${scanning ? "" : "hidden"}`} muted playsInline aria-label="Camera preview" />
            {!scanning && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-400">Camera is off</div>}
            {scanning && <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-violet-400/80" aria-hidden="true" />}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-3 flex gap-2">
            {scanning ? <Button variant="secondary" onClick={stop}>Stop camera</Button> : <Button onClick={start}>Start camera</Button>}
          </div>
          {cameraError && <div className="mt-3"><Alert tone="amber">{cameraError}</Alert></div>}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) void resolve(manual.trim());
            }}
          >
            <label htmlFor="manual-token" className="sr-only">Scanned code or verification URL</label>
            <input id="manual-token" value={manual} onChange={(e) => setManual(e.target.value)} className={inputClass} placeholder="Paste code / use handheld scanner" autoComplete="off" />
            <Button type="submit" variant="secondary" disabled={busy}>Verify</Button>
          </form>
        </div>
        <div aria-live="polite" className="space-y-3">
          {busy && <p className="text-sm text-slate-400">Checking…</p>}
          {!result && !busy && <p className="text-sm text-slate-400">Scan a participant&apos;s ID card QR code.</p>}
          {result && ui && (
            <div className="space-y-3">
              <Alert tone={ui.tone} title={ui.title} />
              {result.participant && result.team && (
                <div className="rounded-xl border border-navy-700 bg-navy-850 p-4">
                  <p className="text-lg font-bold text-white">{result.participant.full_name}</p>
                  <p className="font-mono text-sm text-slate-300">{result.participant.participant_code}</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Team <strong className="text-white">{result.team.name}</strong> <span className="font-mono text-xs">({result.team.team_code})</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-2 text-sm">
                    <Badge tone="violet">{result.participant.role === "leader" ? "Team Leader" : "Member"}</Badge>
                    {result.team.status !== "approved" && <Badge tone="amber">Registration {result.team.status}</Badge>}
                  </p>
                  {result.participant.college && <p className="mt-2 text-xs text-slate-400">{result.participant.college}{result.participant.department && ` · ${result.participant.department}`}</p>}
                  {result.checked_in_at && <p className="mt-2 text-xs text-amber-200">Checked in at {new Date(result.checked_in_at).toLocaleString()}</p>}
                  {result.state === "valid" && (
                    <Button className="mt-4 w-full" onClick={checkIn} disabled={busy || result.team.status === "rejected"}>Confirm check-in</Button>
                  )}
                </div>
              )}
            </div>
          )}
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
        </div>
      </div>
    </Card>
  );
}
