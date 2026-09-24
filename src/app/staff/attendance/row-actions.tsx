"use client";

import { useState, useTransition } from "react";
import { Button, inputClass } from "@/components/ui";
import { confirmCheckIn, undoCheckIn } from "./actions";

export function ManualCheckInButton({ participantId, name }: { participantId: string; name: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Check in ${name}?`)) return;
          start(async () => {
            const res = await confirmCheckIn(participantId, "manual");
            setMsg(res.ok ? "Checked in" : res.message ?? "Failed");
          });
        }}
      >
        {pending ? "Saving…" : "Check in"}
      </Button>
      {msg && <span role="status" className="text-xs text-slate-300">{msg}</span>}
    </span>
  );
}

export function UndoCheckIn({ attendanceId }: { attendanceId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Undo</Button>;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await undoCheckIn(attendanceId, reason);
          if (!res.ok) setError(res.message ?? "Failed");
          else setOpen(false);
        });
      }}
    >
      <label className="sr-only" htmlFor={`reason-${attendanceId}`}>Reason for correction</label>
      <input id={`reason-${attendanceId}`} className={`${inputClass} h-8 w-48 py-1`} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required />
      <Button size="sm" variant="danger" disabled={pending || reason.trim().length < 3}>{pending ? "Saving…" : "Confirm undo"}</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
      {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
    </form>
  );
}
