-- =============================================================================
-- Hackathon Management System — core schema
-- Single-event hackathon: exactly one row in `hackathons`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'admin', 'official', 'participant');
create type public.form_status as enum ('draft', 'published', 'closed');
create type public.registration_status as enum ('pending', 'approved', 'rejected', 'flagged');
create type public.pdf_status as enum ('not_generated', 'generated', 'outdated', 'failed');
create type public.member_role as enum ('leader', 'member');
create type public.attendance_status as enum ('present', 'corrected');
create type public.support_status as enum ('new', 'assigned', 'in_progress', 'resolved', 'closed');
create type public.job_status as enum ('processing', 'completed', 'failed');
create type public.announcement_status as enum ('draft', 'published', 'archived');
create type public.audience as enum ('all', 'participants', 'staff');
create type public.schedule_visibility as enum ('public', 'participants', 'staff');

-- ---------------------------------------------------------------------------
-- Utility: team-name normalisation (must match src/lib/domain/normalize.ts)
--   trim, collapse internal whitespace to one space, lower-case.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_team_name(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'), '^ | $', '', 'g'));
$$;

create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(coalesce(p_email, ''), '^\s+|\s+$', '', 'g'));
$$;

-- Opaque, non-guessable token (2 x UUIDv4 = 244 random bits), no pgcrypto needed.
create or replace function public.generate_opaque_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- ---------------------------------------------------------------------------
-- Hackathon (single event)
-- ---------------------------------------------------------------------------
create table public.hackathons (
  id                     uuid primary key default gen_random_uuid(),
  singleton              boolean not null default true unique check (singleton),
  name                   text not null check (char_length(name) between 2 and 120),
  tagline                text,
  description            text,
  logo_path              text,
  organizer_name         text,
  organizer_logo_path    text,
  primary_color          text not null default '#3b82f6' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color           text not null default '#8b5cf6' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  starts_at              timestamptz,
  ends_at                timestamptz,
  timezone               text not null default 'UTC',
  venue                  text,
  contact_email          text,
  contact_phone          text,
  support_instructions   text,
  -- Year component of generated IDs (TEAM-<year>-0001). Fixed once teams exist.
  id_year                integer not null default extract(year from now())::int check (id_year between 2000 and 2999),
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  min_team_size          integer not null default 1 check (min_team_size >= 1),
  max_team_size          integer not null default 4 check (max_team_size <= 20),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (max_team_size >= min_team_size),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

-- ---------------------------------------------------------------------------
-- Registration forms & submissions
-- ---------------------------------------------------------------------------
create table public.registration_forms (
  id                 uuid primary key default gen_random_uuid(),
  hackathon_id       uuid not null references public.hackathons(id) on delete cascade,
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title              text not null check (char_length(title) between 2 and 150),
  description        text,
  status             public.form_status not null default 'draft',
  min_team_size      integer not null default 1 check (min_team_size >= 1),
  max_team_size      integer not null default 4 check (max_team_size <= 20),
  requires_approval  boolean not null default false,
  -- { "<field>": { "enabled": bool, "required": bool } } for optional member fields
  field_config       jsonb not null default '{}'::jsonb,
  -- [{ "id": "q1", "label": "...", "type": "text|textarea|select", "options": [], "required": bool }]
  custom_questions   jsonb not null default '[]'::jsonb check (jsonb_typeof(custom_questions) = 'array'),
  opens_at           timestamptz,
  closes_at          timestamptz,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (max_team_size >= min_team_size)
);
create index registration_forms_hackathon_idx on public.registration_forms(hackathon_id);

-- ---------------------------------------------------------------------------
-- Teams & participants
-- ---------------------------------------------------------------------------
create sequence public.team_code_seq;
create sequence public.participant_code_seq;

create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  hackathon_id    uuid not null references public.hackathons(id) on delete cascade,
  form_id         uuid references public.registration_forms(id) on delete set null,
  team_code       text not null unique,
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  name_key        text generated always as (public.normalize_team_name(name)) stored,
  college         text,
  status          public.registration_status not null default 'approved',
  status_reason   text,
  pdf_status      public.pdf_status not null default 'not_generated',
  custom_answers  jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint teams_name_key_unique unique (hackathon_id, name_key)
);
create index teams_hackathon_idx on public.teams(hackathon_id);
create index teams_status_idx on public.teams(status);
create index teams_pdf_status_idx on public.teams(pdf_status);
create index teams_college_idx on public.teams(college);
create index teams_created_idx on public.teams(created_at desc);

create table public.participants (
  id               uuid primary key default gen_random_uuid(),
  hackathon_id     uuid not null references public.hackathons(id) on delete cascade,
  team_id          uuid not null references public.teams(id) on delete cascade,
  participant_code text not null unique,
  full_name        text not null check (char_length(btrim(full_name)) between 2 and 100),
  email            text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  email_key        text generated always as (public.normalize_email(email)) stored,
  phone            text check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  college          text,
  department       text,
  academic_year    text,
  role             public.member_role not null default 'member',
  photo_path       text,
  qr_token         text not null unique default public.generate_opaque_token(),
  qr_revoked_at    timestamptz,
  user_id          uuid unique references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A participant belongs to one team per event.
  constraint participants_email_unique unique (hackathon_id, email_key)
);
create index participants_team_idx on public.participants(team_id);
create unique index participants_one_leader_per_team on public.participants(team_id) where role = 'leader';
create index participants_name_idx on public.participants(lower(full_name));

-- ---------------------------------------------------------------------------
-- Profiles (auth user profile + role) & official permissions
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text,
  full_name                text,
  role                     public.app_role not null default 'participant',
  participant_id           uuid unique references public.participants(id) on delete set null,
  is_active                boolean not null default true,
  must_change_password     boolean not null default false,
  temp_password_expires_at timestamptz,
  last_sign_in_at          timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (role = 'participant' or participant_id is null)
);
create index profiles_role_idx on public.profiles(role);

create table public.official_permissions (
  profile_id              uuid primary key references public.profiles(id) on delete cascade,
  can_edit_registrations  boolean not null default false,
  can_generate_pdf        boolean not null default false,
  can_correct_attendance  boolean not null default false,
  can_manage_all_support  boolean not null default false,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles(id) on delete set null
);

create table public.credential_events (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references public.profiles(id) on delete set null,
  participant_id  uuid references public.participants(id) on delete set null,
  event_type      text not null check (event_type in (
                    'invite_sent', 'temp_password_issued', 'password_reset_sent',
                    'password_changed', 'account_deactivated', 'account_reactivated')),
  actor_id        uuid references public.profiles(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now()
);
create index credential_events_profile_idx on public.credential_events(profile_id);

create table public.registration_submissions (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid references public.registration_forms(id) on delete set null,
  idempotency_key  text unique check (idempotency_key is null or char_length(idempotency_key) between 8 and 100),
  status           text not null check (status in ('accepted', 'rejected')),
  team_id          uuid references public.teams(id) on delete set null,
  payload          jsonb not null default '{}'::jsonb,
  errors           jsonb,
  created_at       timestamptz not null default now()
);
create index registration_submissions_form_idx on public.registration_submissions(form_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ID card templates & per-team PDF jobs
-- ---------------------------------------------------------------------------
create table public.id_card_templates (
  id            uuid primary key default gen_random_uuid(),
  hackathon_id  uuid not null references public.hackathons(id) on delete cascade,
  version       integer not null,
  name          text not null default 'Default portrait card',
  is_active     boolean not null default false,
  config        jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (hackathon_id, version)
);
create unique index id_card_templates_one_active on public.id_card_templates(hackathon_id) where is_active;

create table public.id_card_jobs (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  template_id       uuid references public.id_card_templates(id) on delete set null,
  template_version  integer,
  member_count      integer not null default 0,
  page_count        integer not null default 0,
  status            public.job_status not null default 'processing',
  file_path         text,
  file_name         text,
  error             text,
  generated_by      uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index id_card_jobs_team_idx on public.id_card_jobs(team_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table public.attendance (
  id                 uuid primary key default gen_random_uuid(),
  participant_id     uuid not null references public.participants(id) on delete cascade,
  team_id            uuid not null references public.teams(id) on delete cascade,
  session_key        text not null default 'main' check (session_key ~ '^[a-z0-9_-]{1,40}$'),
  status             public.attendance_status not null default 'present',
  method             text not null check (method in ('qr', 'manual')),
  checked_in_at      timestamptz not null default now(),
  recorded_by        uuid references public.profiles(id) on delete set null,
  corrected_at       timestamptz,
  corrected_by       uuid references public.profiles(id) on delete set null,
  correction_reason  text,
  check (status = 'present' or (correction_reason is not null and char_length(btrim(correction_reason)) >= 3))
);
-- Duplicate check-in prevention: at most one active check-in per participant/session.
create unique index attendance_one_active_checkin on public.attendance(participant_id, session_key) where status = 'present';
create index attendance_team_idx on public.attendance(team_id);
create index attendance_time_idx on public.attendance(checked_in_at desc);

-- ---------------------------------------------------------------------------
-- Help & support
-- ---------------------------------------------------------------------------
create table public.support_requests (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  created_by       uuid references public.profiles(id) on delete set null,
  category         text not null check (category in ('technical', 'logistics', 'registration', 'id_card', 'food', 'medical', 'other')),
  subject          text not null check (char_length(btrim(subject)) between 3 and 150),
  description      text not null check (char_length(btrim(description)) between 5 and 5000),
  contact_email    text,
  contact_phone    text,
  attachment_path  text,
  status           public.support_status not null default 'new',
  assigned_to      uuid references public.profiles(id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index support_requests_team_idx on public.support_requests(team_id);
create index support_requests_assigned_idx on public.support_requests(assigned_to);
create index support_requests_status_idx on public.support_requests(status);

create table public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.support_requests(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  body         text not null check (char_length(btrim(body)) between 1 and 5000),
  is_internal  boolean not null default false,
  created_at   timestamptz not null default now()
);
create index support_messages_request_idx on public.support_messages(request_id, created_at);

create table public.support_status_history (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.support_requests(id) on delete cascade,
  from_status  public.support_status,
  to_status    public.support_status not null,
  assigned_to  uuid references public.profiles(id) on delete set null,
  changed_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index support_status_history_request_idx on public.support_status_history(request_id, created_at);

-- In-app notifications (team-scoped or user-scoped).
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references public.teams(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (team_id is not null or profile_id is not null)
);
create index notifications_team_idx on public.notifications(team_id, created_at desc);
create index notifications_profile_idx on public.notifications(profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Announcements & schedule
-- ---------------------------------------------------------------------------
create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  hackathon_id  uuid not null references public.hackathons(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 2 and 150),
  body          text not null check (char_length(body) <= 10000),
  status        public.announcement_status not null default 'draft',
  audience      public.audience not null default 'all',
  is_important  boolean not null default false,
  published_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index announcements_status_idx on public.announcements(status, published_at desc);

create table public.event_schedule (
  id            uuid primary key default gen_random_uuid(),
  hackathon_id  uuid not null references public.hackathons(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 2 and 150),
  description   text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  venue         text,
  visibility    public.schedule_visibility not null default 'public',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index event_schedule_start_idx on public.event_schedule(starts_at);

-- ---------------------------------------------------------------------------
-- Audit log & rate limits
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  actor_role   text,
  action       text not null,
  entity_type  text,
  entity_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs(actor_id);

create table public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  hits          integer not null
);
