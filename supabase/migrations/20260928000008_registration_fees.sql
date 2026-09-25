-- Registration fees paid by UPI: the team pays, submits the transaction ID
-- (UTR) and a screenshot, and the hackathon's staff verify it.
alter table public.registration_forms
  add column if not exists fee_enabled boolean not null default false,
  add column if not exists fee_amount numeric(10,2) check (fee_amount is null or fee_amount > 0),
  add column if not exists fee_basis text not null default 'team' check (fee_basis in ('team', 'member')),
  add column if not exists fee_upi_id text check (fee_upi_id is null or fee_upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$'),
  add column if not exists fee_payee_name text check (fee_payee_name is null or char_length(fee_payee_name) <= 100),
  add column if not exists fee_instructions text check (fee_instructions is null or char_length(fee_instructions) <= 1000);

alter table public.teams
  add column if not exists payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'submitted', 'verified', 'rejected')),
  add column if not exists payment_amount numeric(10,2),
  add column if not exists payment_utr text check (payment_utr is null or payment_utr ~ '^[A-Za-z0-9]{6,35}$'),
  add column if not exists payment_proof_path text,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists payment_verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_note text check (payment_note is null or char_length(payment_note) <= 500);

-- The same UPI transaction cannot pay for two teams in one hackathon.
create unique index if not exists teams_payment_utr_unique on public.teams (hackathon_id, upper(payment_utr)) where payment_utr is not null;
create index if not exists teams_payment_status_idx on public.teams (hackathon_id, payment_status);

-- Payment screenshots: private; read through short-lived signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do nothing;

-- Staff lists show the payment state (columns appended to the view).
create or replace view public.team_overview with (security_invoker = true) as
select
  t.id, t.hackathon_id, t.team_code, t.name, t.college, t.status, t.status_reason, t.pdf_status, t.created_at, t.updated_at,
  l.id as leader_id, l.full_name as leader_name, l.email as leader_email, l.phone as leader_phone,
  coalesce(m.member_count, 0)::int as member_count,
  coalesce(a.present_count, 0)::int as present_count,
  case
    when coalesce(a.present_count, 0) = 0 then 'none'
    when a.present_count >= coalesce(m.member_count, 0) then 'full'
    else 'partial'
  end as attendance_state,
  coalesce(m.member_search, '') as member_search,
  t.payment_status, t.payment_amount, t.payment_utr
from public.teams t
left join public.participants l on l.team_id = t.id and l.role = 'leader'
left join lateral (
  select count(*) as member_count,
         string_agg(p.participant_code || ' ' || p.full_name || ' ' || p.email, ' ') as member_search
  from public.participants p where p.team_id = t.id
) m on true
left join lateral (
  select count(distinct at.participant_id) as present_count
  from public.attendance at where at.team_id = t.id and at.status = 'present' and at.session_key = 'main'
) a on true;
