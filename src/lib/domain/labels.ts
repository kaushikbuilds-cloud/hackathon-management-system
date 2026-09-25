export type RegistrationStatus = "pending" | "approved" | "rejected" | "flagged";
export type PdfStatus = "not_generated" | "generated" | "outdated" | "failed";
export type AttendanceState = "not_checked_in" | "present" | "corrected";
export type TeamAttendanceState = "none" | "partial" | "full";
/** "vendor" is a food shop's own login (Shop portal). */
export type AppRole = "super_admin" | "admin" | "official" | "participant" | "vendor";

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  flagged: "Flagged",
};

export const PDF_STATUS_LABEL: Record<PdfStatus, string> = {
  not_generated: "Not Generated",
  generated: "Generated",
  outdated: "Outdated",
  failed: "Failed",
};

export const ATTENDANCE_STATE_LABEL: Record<AttendanceState, string> = {
  not_checked_in: "Not Checked In",
  present: "Present",
  corrected: "Corrected",
};

export const TEAM_ATTENDANCE_LABEL: Record<TeamAttendanceState, string> = {
  none: "None present",
  partial: "Partially present",
  full: "All present",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  official: "Official",
  participant: "Participant",
  vendor: "Food shop",
};
