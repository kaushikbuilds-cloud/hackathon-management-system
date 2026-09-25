import type { AppRole, PdfStatus, RegistrationStatus, AttendanceState, TeamAttendanceState } from "@/lib/domain/labels";
import type { SupportStatus } from "@/lib/domain/support";

export type HackathonStatus = "setup" | "active" | "completed" | "archived";

export type Hackathon = {
  id: string;
  slug: string;
  status: HackathonStatus;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_path: string | null;
  organizer_name: string | null;
  organizer_logo_path: string | null;
  primary_color: string;
  accent_color: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  support_instructions: string | null;
  id_year: number;
  /** Starts every Team / Participant ID of this hackathon, e.g. SAMPLE1 → SAMPLE1-T0001. */
  code_prefix: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  min_team_size: number;
  max_team_size: number;
  portal_id_cards: boolean;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  participant_id: string | null;
  /** Set on a team's shared portal login (then participant_id is null). */
  team_id?: string | null;
  /** The hackathon this person belongs to (null for the Super Admin). */
  hackathon_id: string | null;
  is_active: boolean;
  status: "active" | "suspended" | "deactivated";
  phone: string | null;
  job_title: string | null;
  must_change_password: boolean;
  temp_password_expires_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
};

export type { Permission } from "@/lib/permissions";

export type Invitation = {
  id: string;
  hackathon_id: string | null;
  purpose: "activate" | "reset";
  role: "admin" | "official" | "participant";
  email: string;
  full_name: string | null;
  phone: string | null;
  job_title: string | null;
  participant_id: string | null;
  profile_id: string | null;
  permissions: string[];
  duty: string | null;
  station: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  created_at: string;
};

export type OfficialAssignment = { profile_id: string; duty: string | null; station: string | null };

export type RegistrationForm = {
  id: string;
  hackathon_id: string;
  slug: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "closed";
  min_team_size: number;
  max_team_size: number;
  requires_approval: boolean;
  field_config: unknown;
  custom_questions: unknown;
  opens_at: string | null;
  closes_at: string | null;
  published_at: string | null;
  fee_enabled: boolean;
  fee_amount: number | null;
  fee_basis: "team" | "member";
  fee_upi_id: string | null;
  fee_payee_name: string | null;
  fee_instructions: string | null;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  hackathon_id: string;
  team_code: string;
  name: string;
  college: string | null;
  status: RegistrationStatus;
  status_reason: string | null;
  pdf_status: PdfStatus;
  custom_answers: Record<string, string>;
  payment_status: PaymentStatus;
  payment_amount: number | null;
  payment_utr: string | null;
  payment_proof_path: string | null;
  payment_submitted_at: string | null;
  payment_verified_by: string | null;
  payment_verified_at: string | null;
  payment_note: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentStatus = "not_required" | "submitted" | "verified" | "rejected";

export type TeamOverview = {
  id: string;
  team_code: string;
  name: string;
  college: string | null;
  status: RegistrationStatus;
  pdf_status: PdfStatus;
  created_at: string;
  leader_id: string | null;
  leader_name: string | null;
  leader_email: string | null;
  member_count: number;
  present_count: number;
  attendance_state: TeamAttendanceState;
  payment_status: PaymentStatus;
  payment_amount: number | null;
  payment_utr: string | null;
};

export type Participant = {
  id: string;
  team_id: string;
  participant_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  college: string | null;
  department: string | null;
  academic_year: string | null;
  role: "leader" | "member";
  photo_path: string | null;
  qr_token: string;
  qr_revoked_at: string | null;
  user_id: string | null;
  created_at: string;
};

export type ParticipantOverview = Omit<Participant, "qr_token"> & {
  team_name: string;
  team_code: string;
  team_status: RegistrationStatus;
  attendance_id: string | null;
  checked_in_at: string | null;
  attendance_state: AttendanceState;
};

export type IdCardTemplate = {
  id: string;
  version: number;
  name: string;
  is_active: boolean;
  config: unknown;
  created_at: string;
  created_by: string | null;
};

export type IdCardJob = {
  id: string;
  team_id: string;
  template_version: number | null;
  member_count: number;
  page_count: number;
  status: "processing" | "completed" | "failed";
  file_path: string | null;
  file_name: string | null;
  error: string | null;
  generated_by: string | null;
  created_at: string;
  completed_at: string | null;
};

export type SupportRequest = {
  id: string;
  team_id: string;
  created_by: string | null;
  category: string;
  subject: string;
  description: string;
  contact_email: string | null;
  contact_phone: string | null;
  attachment_path: string | null;
  status: SupportStatus;
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: string;
  request_id: string;
  author_id: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published" | "archived";
  audience: "all" | "participants" | "staff";
  is_important: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleItem = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  visibility: "public" | "participants" | "staff";
};

export type AuditLog = {
  id: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type FoodShop = {
  id: string;
  hackathon_id: string;
  name: string;
  description: string | null;
  location: string | null;
  is_free: boolean;
  is_open: boolean;
  created_at: string;
};

export type FoodItem = {
  id: string;
  hackathon_id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  limit_per_person: number | null;
  sort_order: number;
};

export type FoodOrderStatus = "placed" | "preparing" | "ready" | "collected" | "cancelled";

export type FoodOrder = {
  id: string;
  hackathon_id: string;
  shop_id: string;
  participant_id: string;
  order_no: number;
  status: FoodOrderStatus;
  is_free: boolean;
  total: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FoodOrderLine = { name: string; price: number; qty: number };

export type Faq = {
  id: string;
  hackathon_id: string;
  question: string;
  answer: string;
  category: string | null;
  audience: "public" | "participants";
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
