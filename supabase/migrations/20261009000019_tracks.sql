-- Tracks: the Admin lists the hackathon's tracks (AI/ML, Web, IoT, ...);
-- each team picks one when it registers. Staff can change it later.
alter table public.hackathons add column if not exists tracks text[] not null default '{}';
alter table public.hackathons drop constraint if exists hackathons_tracks_limit;
alter table public.hackathons add constraint hackathons_tracks_limit check (cardinality(tracks) <= 20);
alter table public.teams add column if not exists track text check (length(btrim(track)) between 1 and 60);
create index if not exists teams_track_idx on public.teams (hackathon_id, track);
-- Staff who can correct registrations may change a team's track (row access still follows RLS).
grant update (track) on public.teams to authenticated;

-- The Teams list shows and filters by track (added as the last column).
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
  t.payment_status, t.payment_amount, t.payment_utr,
  t.track
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
