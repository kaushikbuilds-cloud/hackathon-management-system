-- Mentor help desk: while the desk is open, a team asks for a mentor from its
-- portal (topic, what it needs, where it sits); mentors (Officials with the
-- new permission) see a live queue, claim a request and mark it done.

insert into public.permissions (key, label, description, grantable_to, default_for, sort_order) values
  ('mentor_teams', 'Mentor: help teams', 'See the mentor queue, take help requests from teams and mark them done.', '{admin,official}', '{admin}', 160)
on conflict (key) do nothing;
insert into public.staff_permissions (profile_id, permission)
select p.id, 'mentor_teams' from public.profiles p where p.role = 'admin'
on conflict do nothing;

alter table public.hackathons add column if not exists mentor_desk_open boolean not null default false;

create table if not exists public.mentor_requests (
  id           uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  topic        text not null check (topic in ('Frontend', 'Backend', 'Mobile', 'AI / ML', 'Design', 'Deployment', 'Idea & pitch', 'Other')),
  details      text not null check (length(btrim(details)) between 5 and 500),
  location     text check (length(location) <= 80),
  status       text not null default 'waiting' check (status in ('waiting', 'helping', 'done', 'cancelled')),
  mentor_id    uuid references public.profiles(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  closed_at    timestamptz
);
create index if not exists mentor_requests_queue_idx on public.mentor_requests (hackathon_id, status, created_at);
create index if not exists mentor_requests_team_idx on public.mentor_requests (team_id, created_at desc);
-- One open request per team at a time.
create unique index if not exists mentor_requests_one_open on public.mentor_requests (team_id) where status in ('waiting', 'helping');

alter table public.mentor_requests enable row level security;
grant select on public.mentor_requests to authenticated;
grant all on public.mentor_requests to service_role;
drop policy if exists mentor_requests_read on public.mentor_requests;
create policy mentor_requests_read on public.mentor_requests for select to authenticated
  using (team_id = public.my_team_id()
         or (hackathon_id = public.current_hackathon_id() and public.has_permission('mentor_teams')));

-- A team member asks for a mentor.
create or replace function public.request_mentor(p_topic text, p_details text, p_location text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_h uuid;
  v_open boolean;
  v_id uuid;
begin
  if v_team is null then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select t.hackathon_id, h.mentor_desk_open into v_h, v_open
    from public.teams t join public.hackathons h on h.id = t.hackathon_id
    where t.id = v_team and t.status = 'approved';
  if v_h is null then
    return jsonb_build_object('ok', false, 'message', 'Only approved teams can ask for a mentor.');
  end if;
  if not v_open then
    return jsonb_build_object('ok', false, 'message', 'The mentor desk is closed right now.');
  end if;
  insert into public.mentor_requests (hackathon_id, team_id, topic, details, location, created_by)
  values (v_h, v_team, p_topic, btrim(p_details), nullif(btrim(p_location), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'message', 'Your team already has an open request. Cancel it to ask about something else.');
  when check_violation then
    return jsonb_build_object('ok', false, 'message', 'Choose a topic and describe what you need (5–500 characters).');
end;
$$;
revoke execute on function public.request_mentor(text, text, text) from public, anon;
grant execute on function public.request_mentor(text, text, text) to authenticated;

-- The team cancels its waiting request.
create or replace function public.cancel_mentor_request(p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.mentor_requests set status = 'cancelled', closed_at = now()
  where id = p_request and team_id = public.my_team_id() and status in ('waiting', 'helping');
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That request is no longer open.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.cancel_mentor_request(uuid) from public, anon;
grant execute on function public.cancel_mentor_request(uuid) to authenticated;

-- A mentor claims ('claim'), hands back ('release') or finishes ('done') a request.
create or replace function public.mentor_request_action(p_request uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_h uuid := public.current_hackathon_id();
  r record;
  v_name text;
begin
  if v_h is null or not public.has_permission('mentor_teams') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_action = 'claim' then
    update public.mentor_requests set status = 'helping', mentor_id = auth.uid(), claimed_at = now()
    where id = p_request and hackathon_id = v_h and status = 'waiting'
    returning * into r;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'Another mentor already took this request, or the team cancelled it.');
    end if;
    select coalesce(nullif(btrim(full_name), ''), 'A mentor') into v_name from public.profiles where id = auth.uid();
    insert into public.notifications (team_id, title, body, link)
    values (r.team_id, 'A mentor is on the way', format('%s is coming to help with %s.', v_name, r.topic), '/portal/mentor');
  elsif p_action in ('release', 'done') then
    update public.mentor_requests
      set status = case when p_action = 'done' then 'done' else 'waiting' end,
          mentor_id = case when p_action = 'done' then mentor_id end,
          claimed_at = case when p_action = 'done' then claimed_at end,
          closed_at = case when p_action = 'done' then now() end
    where id = p_request and hackathon_id = v_h and status = 'helping'
      and (mentor_id = auth.uid() or public.has_permission('manage_event'))
    returning * into r;
    if not found then
      return jsonb_build_object('ok', false, 'message', 'That request is not being handled by you.');
    end if;
  else
    return jsonb_build_object('ok', false, 'message', 'Unknown action.');
  end if;
  return jsonb_build_object('ok', true, 'team_id', r.team_id);
end;
$$;
revoke execute on function public.mentor_request_action(uuid, text) from public, anon;
grant execute on function public.mentor_request_action(uuid, text) to authenticated;
