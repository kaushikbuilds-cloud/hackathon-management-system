-- Judging: the Admin sets scoring criteria and opens judging; judges
-- (officials with judge_teams) score approved teams; the Admin sees a
-- leaderboard (averages across judges) and gives awards from it.

insert into public.permissions (key, label, description, grantable_to, default_for, sort_order) values
  ('judge_teams', 'Judge: score teams', 'Score approved teams on the judging criteria (sees only own scores).', '{admin,official}', '{}', 140),
  ('manage_judging', 'Judging setup & results', 'Set criteria, open or close judging, see every score and the leaderboard.', '{admin}', '{admin}', 150)
on conflict (key) do nothing;
insert into public.staff_permissions (profile_id, permission)
select p.id, 'manage_judging' from public.profiles p where p.role = 'admin'
on conflict do nothing;

alter table public.hackathons add column if not exists judging_open boolean not null default false;

create table if not exists public.judging_criteria (
  id           uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  description  text check (length(description) <= 200),
  max_points   int not null default 10 check (max_points between 1 and 100),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists judging_criteria_hackathon_idx on public.judging_criteria (hackathon_id, sort_order);
alter table public.judging_criteria enable row level security;
grant select, insert, update, delete on public.judging_criteria to authenticated;
drop policy if exists judging_criteria_read on public.judging_criteria;
create policy judging_criteria_read on public.judging_criteria for select to authenticated
  using (hackathon_id = public.current_hackathon_id() and (public.has_permission('judge_teams') or public.has_permission('manage_judging')));
drop policy if exists judging_criteria_write on public.judging_criteria;
create policy judging_criteria_write on public.judging_criteria for all to authenticated
  using (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_judging'))
  with check (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_judging'));

create table if not exists public.judge_scores (
  id           uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  judge_id     uuid not null references public.profiles(id) on delete cascade,
  scores       jsonb not null default '{}',
  comment      text check (length(comment) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (team_id, judge_id)
);
create index if not exists judge_scores_hackathon_idx on public.judge_scores (hackathon_id, team_id);
alter table public.judge_scores enable row level security;
grant select on public.judge_scores to authenticated;
grant all on public.judging_criteria, public.judge_scores to service_role;
-- Judges read only their own scores; the judging managers read all. Writes go through submit_judge_score().
drop policy if exists judge_scores_read on public.judge_scores;
create policy judge_scores_read on public.judge_scores for select to authenticated
  using (hackathon_id = public.current_hackathon_id() and (judge_id = auth.uid() or public.has_permission('manage_judging')));

create or replace function public.submit_judge_score(p_team uuid, p_scores jsonb, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_h uuid := public.current_hackathon_id();
  v_open boolean;
  c record;
  v_val numeric;
  v_clean jsonb := '{}';
  v_total numeric := 0;
begin
  if v_h is null or not public.has_permission('judge_teams') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select judging_open into v_open from public.hackathons where id = v_h;
  if not coalesce(v_open, false) then
    return jsonb_build_object('ok', false, 'message', 'Judging is closed right now.');
  end if;
  if not exists (select 1 from public.teams where id = p_team and hackathon_id = v_h and status = 'approved') then
    return jsonb_build_object('ok', false, 'message', 'Only approved teams can be scored.');
  end if;
  for c in select id, name, max_points from public.judging_criteria where hackathon_id = v_h order by sort_order, created_at loop
    begin
      v_val := (p_scores ->> c.id::text)::numeric;
    exception when others then v_val := null;
    end;
    if v_val is null or v_val < 0 or v_val > c.max_points or v_val <> trunc(v_val) then
      return jsonb_build_object('ok', false, 'message', format('Give %s a whole number from 0 to %s.', c.name, c.max_points));
    end if;
    v_clean := v_clean || jsonb_build_object(c.id::text, v_val);
    v_total := v_total + v_val;
  end loop;
  if v_clean = '{}' then
    return jsonb_build_object('ok', false, 'message', 'No judging criteria are set up yet.');
  end if;
  insert into public.judge_scores (hackathon_id, team_id, judge_id, scores, comment)
  values (v_h, p_team, auth.uid(), v_clean, nullif(btrim(left(p_comment, 1000)), ''))
  on conflict (team_id, judge_id) do update set scores = excluded.scores, comment = excluded.comment, updated_at = now();
  return jsonb_build_object('ok', true, 'total', v_total);
end;
$$;
revoke execute on function public.submit_judge_score(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_judge_score(uuid, jsonb, text) to authenticated;

-- Ranking of approved teams by the average total across judges (current criteria only).
create or replace function public.judging_leaderboard()
returns table (team_id uuid, team_code text, team_name text, track text, college text, award text,
               judges int, avg_total numeric, criteria jsonb)
language sql stable security definer set search_path = public as $$
  with h as (select public.current_hackathon_id() as id where public.has_permission('manage_judging')),
  crit as (select c.id from public.judging_criteria c, h where c.hackathon_id = h.id),
  per as (
    select s.team_id, s.judge_id, k.id as crit_id, (s.scores ->> k.id::text)::numeric as v
    from public.judge_scores s join h on s.hackathon_id = h.id cross join crit k
  ),
  tot as (select team_id, judge_id, sum(v) as total from per group by team_id, judge_id),
  pc as (select team_id, crit_id, round(avg(v), 2) as v from per group by team_id, crit_id),
  avgc as (select team_id, jsonb_object_agg(crit_id, v) as criteria from pc group by team_id)
  select t.id, t.team_code, t.name, t.track, t.college, t.award,
         coalesce((select count(*) from tot where tot.team_id = t.id), 0)::int,
         (select round(avg(total), 2) from tot where tot.team_id = t.id),
         coalesce((select criteria from avgc where avgc.team_id = t.id), '{}')
  from public.teams t join h on t.hackathon_id = h.id
  where t.status = 'approved'
  order by 8 desc nulls last, t.team_code;
$$;
revoke execute on function public.judging_leaderboard() from public, anon;
grant execute on function public.judging_leaderboard() to authenticated;
