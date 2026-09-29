-- Problem statements: the Admin publishes the hackathon's problem statements
-- (with an optional team limit each); while selection is open, each team's
-- leader picks one in the team portal.

alter table public.hackathons add column if not exists ps_selection_open boolean not null default false;

create table if not exists public.problem_statements (
  id              uuid primary key default gen_random_uuid(),
  hackathon_id    uuid not null references public.hackathons(id) on delete cascade,
  code            text not null,
  title           text not null check (length(btrim(title)) between 3 and 150),
  description     text not null default '' check (length(description) <= 5000),
  track           text check (length(track) <= 60),
  max_teams       int check (max_teams between 1 and 1000),
  attachment_path text,
  is_published    boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (hackathon_id, code)
);
create index if not exists problem_statements_hackathon_idx on public.problem_statements (hackathon_id, sort_order, code);

-- PS01, PS02, ... per hackathon.
create or replace function public.problem_statements_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or btrim(new.code) = '' then
    perform pg_advisory_xact_lock(hashtext('ps_code:' || new.hackathon_id));
    select 'PS' || lpad((coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0) + 1)::text, 2, '0')
      into new.code from public.problem_statements where hackathon_id = new.hackathon_id;
  end if;
  return new;
end;
$$;
drop trigger if exists problem_statements_code on public.problem_statements;
create trigger problem_statements_code before insert on public.problem_statements
  for each row execute function public.problem_statements_code();
revoke execute on function public.problem_statements_code() from public, anon, authenticated;

alter table public.problem_statements enable row level security;
grant select on public.problem_statements to anon, authenticated;
grant insert, update, delete on public.problem_statements to authenticated;
grant all on public.problem_statements to service_role;
-- Published statements are public (event page, team portal); staff who run the event see drafts too.
drop policy if exists problem_statements_read on public.problem_statements;
create policy problem_statements_read on public.problem_statements for select to anon, authenticated
  using (is_published or (hackathon_id = public.current_hackathon_id() and (public.has_permission('manage_event') or public.has_permission('view_participants'))));
drop policy if exists problem_statements_write on public.problem_statements;
create policy problem_statements_write on public.problem_statements for all to authenticated
  using (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_event'))
  with check (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_event'));

alter table public.teams add column if not exists problem_statement_id uuid references public.problem_statements(id) on delete set null;
create index if not exists teams_problem_statement_idx on public.teams (problem_statement_id);
grant update (problem_statement_id) on public.teams to authenticated;

-- How many teams chose each published statement (counts only, no team names).
create or replace function public.problem_statement_taken(p_hackathon uuid)
returns table (statement_id uuid, teams int)
language sql stable security definer set search_path = public as $$
  select s.id, count(t.id)::int
  from public.problem_statements s
  left join public.teams t on t.problem_statement_id = s.id and t.status <> 'rejected'
  where s.hackathon_id = p_hackathon and s.is_published
  group by s.id;
$$;
revoke execute on function public.problem_statement_taken(uuid) from public;
grant execute on function public.problem_statement_taken(uuid) to anon, authenticated;

-- The team (its shared login or the Team Leader) picks a statement, or clears it with null.
create or replace function public.choose_problem_statement(p_statement uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_h uuid;
  v_open boolean;
  s record;
  v_taken int;
begin
  if v_team is null or not public.is_team_leader() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select t.hackathon_id, h.ps_selection_open into v_h, v_open
    from public.teams t join public.hackathons h on h.id = t.hackathon_id where t.id = v_team and t.status <> 'rejected';
  if v_h is null then
    return jsonb_build_object('ok', false, 'message', 'Your team cannot choose a problem statement.');
  end if;
  if not v_open then
    return jsonb_build_object('ok', false, 'message', 'Problem statement selection is closed.');
  end if;
  if p_statement is not null then
    select * into s from public.problem_statements where id = p_statement and hackathon_id = v_h and is_published for update;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'That problem statement is not available.');
    end if;
    select count(*) into v_taken from public.teams where problem_statement_id = p_statement and id <> v_team and status <> 'rejected';
    if s.max_teams is not null and v_taken >= s.max_teams then
      return jsonb_build_object('ok', false, 'message', format('%s is full (%s teams). Please choose another one.', s.code, s.max_teams));
    end if;
  end if;
  update public.teams set problem_statement_id = p_statement where id = v_team;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.choose_problem_statement(uuid) from public, anon;
grant execute on function public.choose_problem_statement(uuid) to authenticated;

-- The Teams list shows and filters by problem statement (added as the last column).
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
  t.track,
  t.problem_statement_id
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
