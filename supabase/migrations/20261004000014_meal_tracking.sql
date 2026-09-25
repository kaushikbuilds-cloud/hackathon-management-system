-- Meal tracking: the counter scans each person's ID card QR per meal (Day 1
-- Lunch, ...). One serving per person per meal; a second scan says so.
-- Handled by staff with the Food orders permission.

create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  serves_at    timestamptz,
  is_open      boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index if not exists meals_name_unique on public.meals (hackathon_id, lower(btrim(name)));

create table if not exists public.meal_servings (
  id             bigint generated always as identity primary key,
  meal_id        uuid not null references public.meals(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  hackathon_id   uuid not null references public.hackathons(id) on delete cascade,
  method         text not null default 'qr' check (method in ('qr', 'manual')),
  served_by      uuid references public.profiles(id) on delete set null,
  served_at      timestamptz not null default now(),
  unique (meal_id, participant_id)
);
create index if not exists meal_servings_meal_idx on public.meal_servings (meal_id, served_at desc);

alter table public.meals enable row level security;
alter table public.meal_servings enable row level security;
grant select, insert, update, delete on public.meals to authenticated;
grant select on public.meal_servings to authenticated;
grant all on public.meals, public.meal_servings to service_role;

drop policy if exists meals_read on public.meals;
create policy meals_read on public.meals for select to authenticated using (hackathon_id = public.current_hackathon_id());
drop policy if exists meals_manage on public.meals;
create policy meals_manage on public.meals for all to authenticated
  using (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_food'))
  with check (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_food'));
drop policy if exists meal_servings_read on public.meal_servings;
create policy meal_servings_read on public.meal_servings for select to authenticated
  using (hackathon_id = public.current_hackathon_id()
         and (public.has_permission('manage_food')
              or participant_id in (select p.id from public.participants p where p.team_id = public.my_team_id())));

-- Scan (p_token) or pick (p_participant) someone for a meal. Returns the
-- outcome and who it was, so the counter can see the name at a glance.
create or replace function public.serve_meal(p_meal uuid, p_token text default null, p_participant uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_h uuid := public.current_hackathon_id();
  v_meal public.meals;
  v_p record;
  v_prev timestamptz;
  v_id bigint;
begin
  if not public.has_permission('manage_food') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select * into v_meal from public.meals where id = p_meal and hackathon_id = v_h;
  if v_meal.id is null then return jsonb_build_object('state', 'invalid', 'message', 'Meal not found.'); end if;
  if not v_meal.is_open then return jsonb_build_object('state', 'closed', 'message', v_meal.name || ' is not being served right now.'); end if;

  select p.id, p.full_name, p.participant_code, p.qr_revoked_at, t.name as team_name, t.team_code, t.status as team_status
    into v_p
    from public.participants p join public.teams t on t.id = p.team_id
   where p.hackathon_id = v_h
     and ((p_token is not null and p.qr_token = p_token) or (p_token is null and p.id = p_participant));
  if v_p.id is null then return jsonb_build_object('state', 'invalid', 'message', 'This card is not registered for this hackathon.'); end if;
  if p_token is not null and v_p.qr_revoked_at is not null then
    return jsonb_build_object('state', 'invalid', 'message', 'This card has been cancelled. Send them to the help desk.');
  end if;
  if v_p.team_status = 'rejected' then
    return jsonb_build_object('state', 'rejected', 'message', 'This team''s registration was not approved.',
      'participant', jsonb_build_object('full_name', v_p.full_name, 'participant_code', v_p.participant_code, 'team_name', v_p.team_name, 'team_code', v_p.team_code));
  end if;

  insert into public.meal_servings (meal_id, participant_id, hackathon_id, method, served_by)
  values (v_meal.id, v_p.id, v_h, case when p_token is null then 'manual' else 'qr' end, auth.uid())
  on conflict (meal_id, participant_id) do nothing
  returning id into v_id;
  if v_id is null then
    select served_at into v_prev from public.meal_servings where meal_id = v_meal.id and participant_id = v_p.id;
  end if;
  return jsonb_build_object(
    'state', case when v_id is null then 'already' else 'served' end,
    'served_at', coalesce(v_prev, now()),
    'meal', v_meal.name,
    'participant', jsonb_build_object('full_name', v_p.full_name, 'participant_code', v_p.participant_code, 'team_name', v_p.team_name, 'team_code', v_p.team_code),
    'served', (select count(*) from public.meal_servings where meal_id = v_meal.id));
end;
$$;

create or replace function public.undo_meal_serving(p_serving bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('manage_food') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  delete from public.meal_servings where id = p_serving and hackathon_id = public.current_hackathon_id();
  return found;
end;
$$;

-- People who may eat: members of teams that were not rejected.
create or replace function public.meal_eligible_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.participants p join public.teams t on t.id = p.team_id
  where p.hackathon_id = public.current_hackathon_id() and t.status <> 'rejected';
$$;

revoke execute on function public.serve_meal(uuid, text, uuid), public.undo_meal_serving(bigint), public.meal_eligible_count() from public, anon;
grant execute on function public.serve_meal(uuid, text, uuid), public.undo_meal_serving(bigint), public.meal_eligible_count() to authenticated;
