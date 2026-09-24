import { Badge } from "@/components/ui";
import {
  ATTENDANCE_STATE_LABEL, PDF_STATUS_LABEL, REGISTRATION_STATUS_LABEL, TEAM_ATTENDANCE_LABEL,
  type AttendanceState, type PdfStatus, type RegistrationStatus, type TeamAttendanceState,
} from "@/lib/domain/labels";
import { supportStatusLabel, type SupportStatus } from "@/lib/domain/support";

export function RegistrationBadge({ status }: { status: RegistrationStatus }) {
  const tone = { pending: "amber", approved: "green", rejected: "red", flagged: "violet" } as const;
  return <Badge tone={tone[status]}>{REGISTRATION_STATUS_LABEL[status]}</Badge>;
}

export function PdfBadge({ status }: { status: PdfStatus }) {
  const tone = { not_generated: "neutral", generated: "green", outdated: "amber", failed: "red" } as const;
  return <Badge tone={tone[status]}>{PDF_STATUS_LABEL[status]}</Badge>;
}

export function AttendanceBadge({ state }: { state: AttendanceState }) {
  const tone = { not_checked_in: "neutral", present: "green", corrected: "amber" } as const;
  return <Badge tone={tone[state]}>{ATTENDANCE_STATE_LABEL[state]}</Badge>;
}

export function TeamAttendance({ state, present, total }: { state: TeamAttendanceState; present: number; total: number }) {
  const tone = { none: "neutral", partial: "amber", full: "green" } as const;
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={tone[state]}>{present}/{total}</Badge>
      <span className="sr-only">{TEAM_ATTENDANCE_LABEL[state]}</span>
    </span>
  );
}

export function SupportBadge({ status }: { status: SupportStatus }) {
  const tone = { new: "blue", assigned: "violet", in_progress: "amber", resolved: "green", closed: "neutral" } as const;
  return <Badge tone={tone[status]}>{supportStatusLabel(status)}</Badge>;
}
