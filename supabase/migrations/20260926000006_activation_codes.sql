-- =============================================================================
-- One-time activation codes printed on participant ID cards.
-- A participant enters Participant ID + code at /activate to create their
-- portal account. Codes are readable only by the service role (server code
-- that has already checked generate_pdf permission); nobody can list them
-- through the API.
-- =============================================================================

create table if not exists public.participant_activation_codes (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  code           text not null check (code ~ '^[A-HJ-KM-NP-Z2-9]{8}$'),
  created_at     timestamptz not null default now(),
  used_at        timestamptz
);

alter table public.participant_activation_codes enable row level security;
revoke all on public.participant_activation_codes from anon, authenticated;
grant all on public.participant_activation_codes to service_role;
-- No policies: only the service role (bypasses RLS) can read or write codes.

-- Allow the new credential event types.
alter table public.credential_events drop constraint if exists credential_events_event_type_check;
alter table public.credential_events add constraint credential_events_event_type_check check (event_type in (
  'invite_sent', 'temp_password_issued', 'password_reset_sent', 'password_changed',
  'account_deactivated', 'account_reactivated', 'account_suspended',
  'invitation_created', 'invitation_accepted', 'invitation_revoked',
  'activation_code_used'));
