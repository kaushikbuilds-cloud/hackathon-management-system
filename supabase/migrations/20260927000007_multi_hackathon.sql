-- =============================================================================
-- Multiple hackathons on one platform.
--
-- * The platform owner (Super Admin) creates hackathons and invites each
--   hackathon's Admin. Admins, Officials and participants belong to exactly
--   one hackathon (profiles.hackathon_id).
-- * current_hackathon_id() is the hackathon the signed-in user works in. For
--   the Super Admin it is the hackathon they opened (x-hackathon-id request
--   header, ignored for everyone else); with none opened they see platform
--   data only.
-- * RESTRICTIVE policies add "same hackathon" to every existing policy, so a
--   user can never read or change another hackathon's rows, whatever their
--   permissions.
-- Safe on an existing single-hackathon database: all current rows are
-- attached to the existing hackathon.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Hackathons: many rows, each with a public slug and a lifecycle status.
-- ---------------------------------------------------------------------------
alter table public.hackathons drop column if exists singleton;
alter table public.hackathons
  add column if not exists slug text,
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.hackathons add constraint hackathons_status_check check (status in ('setup', 'active', 'completed', 'archived'));
exception when duplicate_object then null; end $$;

create or replace function public.slugify(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-'), '');
$$;

create or replace function public.hackathons_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  n int := 1;
begin
  if new.slug is null or btrim(new.slug) = '' then
    v_base := left(coalesce(public.slugify(new.name), 'hackathon'), 50);
    v_slug := v_base;
    while exists (select 1 from public.hackathons h where h.slug = v_slug and h.id <> new.id) loop
      n := n + 1;
      v_slug := v_base || '-' || n;
    end loop;
    new.slug := v_slug;
  else
    new.slug := public.slugify(new.slug);
  end if;
  return new;
end;
$$;

drop trigger if exists hackathons_before_write on public.hackathons;
create trigger hackathons_before_write before insert or update of slug, name on public.hackathons
  for each row when (new.slug is null or new.slug is distinct from public.slugify(new.slug))
  execute function public.hackathons_before_write();

update public.hackathons set slug = null where slug is null; -- fires the trigger for existing rows
alter table public.hackathons alter column slug set not null;
do $$ begin
  alter table public.hackathons add constraint hackathons_slug_key unique (slug);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.hackathons add constraint hackathons_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60);
exception when duplicate_object then null; end $$;

-- Only the platform owner changes a hackathon's lifecycle status or owner.
create or replace function public.hackathons_guard_platform_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_super_admin()
     and (new.status is distinct from old.status or new.created_by is distinct from old.created_by) then
    raise exception 'Only the platform owner can change the hackathon status' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists hackathons_guard_platform_fields on public.hackathons;
create trigger hackathons_guard_platform_fields before update on public.hackathons
  for each row execute function public.hackathons_guard_platform_fields();

-- ---------------------------------------------------------------------------
-- hackathon_id on every hackathon-owned table that did not have one.
-- ---------------------------------------------------------------------------
alter table public.profiles                 add column if not exists hackathon_id uuid references public.hackathons(id) on delete set null;
alter table public.attendance               add column if not exists hackathon_id uuid references public.hackathons(id) on delete cascade;
alter table public.support_requests         add column if not exists hackathon_id uuid references public.hackathons(id) on delete cascade;
alter table public.id_card_jobs             add column if not exists hackathon_id uuid references public.hackathons(id) on delete cascade;
alter table public.registration_submissions add column if not exists hackathon_id uuid references public.hackathons(id) on delete cascade;
alter table public.invitations              add column if not exists hackathon_id uuid references public.hackathons(id) on delete cascade;
alter table public.audit_logs               add column if not exists hackathon_id uuid references public.hackathons(id) on delete set null;
alter table public.credential_events        add column if not exists hackathon_id uuid references public.hackathons(id) on delete set null;

create index if not exists profiles_hackathon_idx on public.profiles(hackathon_id);
create index if not exists attendance_hackathon_idx on public.attendance(hackathon_id);
create index if not exists support_requests_hackathon_idx on public.support_requests(hackathon_id);
create index if not exists id_card_jobs_hackathon_idx on public.id_card_jobs(hackathon_id);
create index if not exists submissions_hackathon_idx on public.registration_submissions(hackathon_id);
create index if not exists invitations_hackathon_idx on public.invitations(hackathon_id);
create index if not exists audit_logs_hackathon_idx on public.audit_logs(hackathon_id, created_at desc);
create index if not exists credential_events_hackathon_idx on public.credential_events(hackathon_id);

-- Backfill from the owning rows (and, for staff, the only existing hackathon).
update public.attendance a set hackathon_id = t.hackathon_id from public.teams t where t.id = a.team_id and a.hackathon_id is null;
update public.support_requests s set hackathon_id = t.hackathon_id from public.teams t where t.id = s.team_id and s.hackathon_id is null;
update public.id_card_jobs j set hackathon_id = t.hackathon_id from public.teams t where t.id = j.team_id and j.hackathon_id is null;
update public.registration_submissions s set hackathon_id = f.hackathon_id from public.registration_forms f where f.id = s.form_id and s.hackathon_id is null;
update public.profiles p set hackathon_id = x.hackathon_id from public.participants x where x.id = p.participant_id and p.hackathon_id is null;
update public.invitations i set hackathon_id = x.hackathon_id from public.participants x where x.id = i.participant_id and i.hackathon_id is null;
do $$
declare v uuid;
begin
  if (select count(*) from public.hackathons) = 1 then
    select id into v from public.hackathons;
    update public.profiles set hackathon_id = v where hackathon_id is null and role in ('admin', 'official');
    update public.invitations set hackathon_id = v where hackathon_id is null and role in ('admin', 'official');
    update public.audit_logs set hackathon_id = v where hackathon_id is null;
    update public.credential_events set hackathon_id = v where hackathon_id is null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The hackathon the current user works in.
-- ---------------------------------------------------------------------------
create or replace function public.requested_hackathon_id()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-hackathon-id';
  if v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.current_hackathon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when p.role = 'super_admin' then public.requested_hackathon_id() else p.hackathon_id end
  from public.profiles p
  where p.id = auth.uid() and p.is_active;
$$;

grant execute on function public.current_hackathon_id(), public.requested_hackathon_id(), public.slugify(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fill hackathon_id automatically on insert (callers never have to).
-- ---------------------------------------------------------------------------
create or replace function public.fill_hackathon_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if new.hackathon_id is not null then
    return new;
  end if;
  if tg_table_name in ('attendance', 'support_requests', 'id_card_jobs') then
    select hackathon_id into v from public.teams where id = new.team_id;
  elsif tg_table_name = 'registration_submissions' then
    select hackathon_id into v from public.registration_forms where id = new.form_id;
  elsif tg_table_name = 'invitations' then
    if new.participant_id is not null then
      select hackathon_id into v from public.participants where id = new.participant_id;
    elsif new.profile_id is not null then
      select hackathon_id into v from public.profiles where id = new.profile_id;
    end if;
    v := coalesce(v, public.current_hackathon_id());
    if v is null and new.role in ('admin', 'official') and (select count(*) from public.hackathons) = 1 then
      select id into v from public.hackathons;
    end if;
  elsif tg_table_name = 'credential_events' then
    if new.participant_id is not null then
      select hackathon_id into v from public.participants where id = new.participant_id;
    end if;
    if v is null and new.profile_id is not null then
      select hackathon_id into v from public.profiles where id = new.profile_id;
    end if;
  elsif tg_table_name = 'audit_logs' then
    if new.actor_id is not null then
      select case when role = 'super_admin' then null else hackathon_id end into v from public.profiles where id = new.actor_id;
    end if;
    v := coalesce(v, public.current_hackathon_id());
  end if;
  new.hackathon_id := v;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['attendance', 'support_requests', 'id_card_jobs', 'registration_submissions', 'invitations', 'credential_events', 'audit_logs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_fill_hackathon', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.fill_hackathon_id()', t || '_fill_hackathon', t);
  end loop;
end $$;

-- Profiles: participants follow their participant row; staff get theirs from
-- the invitation (set by the server). If the platform has exactly one
-- hackathon, new staff default to it (keeps single-event installs working).
create or replace function public.profiles_fill_hackathon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'super_admin' then
    new.hackathon_id := null;
  elsif new.participant_id is not null then
    select hackathon_id into new.hackathon_id from public.participants where id = new.participant_id;
  elsif new.hackathon_id is null and new.role in ('admin', 'official') and (select count(*) from public.hackathons) = 1 then
    select id into new.hackathon_id from public.hackathons;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_fill_hackathon on public.profiles;
create trigger profiles_fill_hackathon before insert or update of role, participant_id, hackathon_id on public.profiles
  for each row execute function public.profiles_fill_hackathon();

-- Staff may only be assigned support requests of their own hackathon.
create or replace function public.support_assignee_same_hackathon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.assigned_to and (p.role = 'super_admin' or p.hackathon_id = new.hackathon_id)
  ) then
    raise exception 'Assignee belongs to another hackathon' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists support_assignee_same_hackathon on public.support_requests;
create trigger support_assignee_same_hackathon before insert or update of assigned_to on public.support_requests
  for each row execute function public.support_assignee_same_hackathon();

-- ---------------------------------------------------------------------------
-- Restrictive "same hackathon" policies (ANDed with the existing ones).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- Fully scoped tables: every command.
  foreach t in array array['teams', 'participants', 'attendance', 'support_requests', 'id_card_jobs',
                           'id_card_templates', 'announcements', 'registration_submissions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_same_hackathon', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated
                      using (hackathon_id = public.current_hackathon_id())
                      with check (hackathon_id = public.current_hackathon_id())', t || '_same_hackathon', t);
  end loop;
end $$;

-- Public content stays readable across hackathons; changes are scoped.
drop policy if exists hackathons_same_hackathon on public.hackathons;
create policy hackathons_same_hackathon on public.hackathons as restrictive for update to authenticated
  using (id = public.current_hackathon_id()) with check (id = public.current_hackathon_id());

drop policy if exists registration_forms_same_hackathon_read on public.registration_forms;
create policy registration_forms_same_hackathon_read on public.registration_forms as restrictive for select to authenticated
  using (status = 'published' or hackathon_id = public.current_hackathon_id());
drop policy if exists registration_forms_same_hackathon_insert on public.registration_forms;
create policy registration_forms_same_hackathon_insert on public.registration_forms as restrictive for insert to authenticated
  with check (hackathon_id = public.current_hackathon_id());
drop policy if exists registration_forms_same_hackathon_update on public.registration_forms;
create policy registration_forms_same_hackathon_update on public.registration_forms as restrictive for update to authenticated
  using (hackathon_id = public.current_hackathon_id()) with check (hackathon_id = public.current_hackathon_id());
drop policy if exists registration_forms_same_hackathon_delete on public.registration_forms;
create policy registration_forms_same_hackathon_delete on public.registration_forms as restrictive for delete to authenticated
  using (hackathon_id = public.current_hackathon_id());

drop policy if exists event_schedule_same_hackathon_read on public.event_schedule;
create policy event_schedule_same_hackathon_read on public.event_schedule as restrictive for select to authenticated
  using (visibility = 'public' or hackathon_id = public.current_hackathon_id());
drop policy if exists event_schedule_same_hackathon_insert on public.event_schedule;
create policy event_schedule_same_hackathon_insert on public.event_schedule as restrictive for insert to authenticated
  with check (hackathon_id = public.current_hackathon_id());
drop policy if exists event_schedule_same_hackathon_update on public.event_schedule;
create policy event_schedule_same_hackathon_update on public.event_schedule as restrictive for update to authenticated
  using (hackathon_id = public.current_hackathon_id()) with check (hackathon_id = public.current_hackathon_id());
drop policy if exists event_schedule_same_hackathon_delete on public.event_schedule;
create policy event_schedule_same_hackathon_delete on public.event_schedule as restrictive for delete to authenticated
  using (hackathon_id = public.current_hackathon_id());

-- People and account records: own row, the platform owner, or same hackathon.
drop policy if exists profiles_same_hackathon on public.profiles;
create policy profiles_same_hackathon on public.profiles as restrictive for select to authenticated
  using (id = auth.uid() or public.is_super_admin() or hackathon_id = public.current_hackathon_id());

drop policy if exists invitations_same_hackathon on public.invitations;
create policy invitations_same_hackathon on public.invitations as restrictive for select to authenticated
  using (public.is_super_admin() or hackathon_id = public.current_hackathon_id());

drop policy if exists audit_logs_same_hackathon on public.audit_logs;
create policy audit_logs_same_hackathon on public.audit_logs as restrictive for select to authenticated
  using (public.is_super_admin() or hackathon_id = public.current_hackathon_id());

drop policy if exists credential_events_same_hackathon on public.credential_events;
create policy credential_events_same_hackathon on public.credential_events as restrictive for select to authenticated
  using (public.is_super_admin() or hackathon_id = public.current_hackathon_id());

-- Per-person staff records follow the profile's visibility (the subquery is
-- itself subject to the profiles policies above).
drop policy if exists staff_permissions_same_hackathon on public.staff_permissions;
create policy staff_permissions_same_hackathon on public.staff_permissions as restrictive for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id));
drop policy if exists official_assignments_same_hackathon on public.official_assignments;
create policy official_assignments_same_hackathon on public.official_assignments as restrictive for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id));
drop policy if exists official_permissions_same_hackathon on public.official_permissions;
create policy official_permissions_same_hackathon on public.official_permissions as restrictive for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id));

-- ---------------------------------------------------------------------------
-- Privileged functions (they bypass RLS): add the same-hackathon check.
-- ---------------------------------------------------------------------------
create or replace function public.attendance_names(p_ids uuid[])
returns table (id uuid, participant_code text, full_name text, team_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.participant_code, p.full_name, t.name
  from public.participants p
  join public.teams t on t.id = p.team_id
  where p.id = any (p_ids)
    and p.hackathon_id = public.current_hackathon_id()
    and exists (
      select 1 from public.attendance a
      where a.participant_id = p.id
        and (public.has_permission('view_attendance') or a.recorded_by = auth.uid())
    );
$$;

create or replace function public.check_in(p_participant_id uuid, p_method text default 'manual', p_session text default 'main')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.participants;
  v_t public.teams;
  v_row public.attendance;
begin
  if p_method not in ('qr', 'manual') then
    raise exception 'Invalid method' using errcode = 'check_violation';
  end if;
  if not public.has_permission(case when p_method = 'qr' then 'record_attendance' else 'manual_checkin' end) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select * into v_p from public.participants where id = p_participant_id and hackathon_id = public.current_hackathon_id();
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Participant not found.');
  end if;
  if p_method = 'qr' and v_p.qr_revoked_at is not null then
    return jsonb_build_object('ok', false, 'code', 'revoked', 'message', 'This QR code has been revoked.');
  end if;
  select * into v_t from public.teams where id = v_p.team_id;
  if v_t.status = 'rejected' then
    return jsonb_build_object('ok', false, 'code', 'team_rejected', 'message', 'This team''s registration was rejected.');
  end if;

  begin
    insert into public.attendance(participant_id, team_id, hackathon_id, session_key, method, recorded_by)
    values (v_p.id, v_p.team_id, v_p.hackathon_id, p_session, p_method, auth.uid())
    returning * into v_row;
  exception when unique_violation then
    select * into v_row from public.attendance
      where participant_id = v_p.id and session_key = p_session and status = 'present';
    return jsonb_build_object('ok', false, 'code', 'already_checked_in', 'message', 'Already checked in.',
                              'checked_in_at', v_row.checked_in_at, 'attendance_id', v_row.id);
  end;
  return jsonb_build_object('ok', true, 'attendance_id', v_row.id, 'checked_in_at', v_row.checked_in_at,
                            'participant_code', v_p.participant_code, 'full_name', v_p.full_name);
end;
$$;

create or replace function public.verify_qr(p_token text, p_session text default 'main')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p public.participants;
  v_t public.teams;
  v_att public.attendance;
begin
  if not (public.has_permission('record_attendance') or public.has_permission('manual_checkin')) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('state', 'invalid');
  end if;
  -- A card from another hackathon is simply "invalid" here.
  select * into v_p from public.participants where qr_token = p_token and hackathon_id = public.current_hackathon_id();
  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;
  select * into v_t from public.teams where id = v_p.team_id;
  select * into v_att from public.attendance
    where participant_id = v_p.id and session_key = p_session and status = 'present';

  return jsonb_build_object(
    'state', case
      when v_p.qr_revoked_at is not null then 'revoked'
      when v_att.id is not null then 'already_checked_in'
      else 'valid' end,
    'participant', jsonb_build_object('id', v_p.id, 'participant_code', v_p.participant_code, 'full_name', v_p.full_name,
                                      'role', v_p.role, 'college', v_p.college, 'department', v_p.department, 'photo_path', v_p.photo_path),
    'team', jsonb_build_object('id', v_t.id, 'team_code', v_t.team_code, 'name', v_t.name, 'status', v_t.status),
    'checked_in_at', v_att.checked_in_at
  );
end;
$$;

create or replace function public.undo_check_in(p_attendance_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance;
begin
  if not public.has_permission('correct_attendance') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'A reason (min. 3 characters) is required.');
  end if;
  update public.attendance
     set status = 'corrected', corrected_at = now(), corrected_by = auth.uid(), correction_reason = btrim(p_reason)
   where id = p_attendance_id and status = 'present' and hackathon_id = public.current_hackathon_id()
  returning * into v_row;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'No active check-in found.');
  end if;
  return jsonb_build_object('ok', true, 'attendance_id', v_row.id);
end;
$$;

create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h uuid := public.current_hackathon_id();
  v jsonb;
begin
  if not public.has_permission('view_reports') or h is null then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'teams', (select count(*) from public.teams where hackathon_id = h),
    'participants', (select count(*) from public.participants where hackathon_id = h),
    'present', (select count(distinct participant_id) from public.attendance where hackathon_id = h and status = 'present' and session_key = 'main'),
    'pending_approvals', (select count(*) from public.teams where hackathon_id = h and status = 'pending'),
    'staff', (select count(*) from public.profiles where hackathon_id = h and role in ('admin', 'official') and status = 'active'),
    'pending_invitations', (select count(*) from public.invitations where hackathon_id = h and role in ('admin', 'official') and accepted_at is null and revoked_at is null and expires_at > now()),
    'open_support', (select count(*) from public.support_requests where hackathon_id = h and status not in ('resolved', 'closed')),
    'registration', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.teams where hackathon_id = h group by status) s), '{}'),
    'pdf', coalesce((select jsonb_object_agg(pdf_status, n) from (select pdf_status, count(*) n from public.teams where hackathon_id = h group by pdf_status) s), '{}'),
    'support', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.support_requests where hackathon_id = h group by status) s), '{}'),
    'teams_by_college', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(btrim(college), ''), 'Unspecified') k, count(*) n from public.teams where hackathon_id = h group by 1) s), '{}'),
    'participants_by_department', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(btrim(department), ''), 'Unspecified') k, count(*) n from public.participants where hackathon_id = h group by 1) s), '{}'),
    'team_attendance', coalesce((select jsonb_object_agg(attendance_state, n) from (select attendance_state, count(*) n from public.team_overview where hackathon_id = h group by 1) s), '{}'),
    'recent_activity', coalesce((select jsonb_agg(jsonb_build_object('action', action, 'at', created_at) order by created_at desc)
                                 from (select action, created_at from public.audit_logs where hackathon_id = h order by created_at desc limit 8) r), '[]')
  ) into v;
  return v;
end;
$$;

create or replace function public.lookup_participants(p_query text)
returns table (id uuid, participant_code text, full_name text, role public.member_role, college text, department text,
               team_id uuid, team_name text, team_code text, team_status public.registration_status,
               attendance_id uuid, checked_in_at timestamptz, attendance_state text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  h uuid := public.current_hackathon_id();
begin
  if not (public.has_permission('manual_checkin') or public.has_permission('view_participants')) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_q) < 2 or h is null then
    return;
  end if;
  return query
  select p.id, p.participant_code, p.full_name, p.role, p.college, p.department,
         t.id, t.name, t.team_code, t.status,
         a.id, a.checked_in_at,
         case when a.id is not null then 'present'
              when exists (select 1 from public.attendance c where c.participant_id = p.id and c.status = 'corrected') then 'corrected'
              else 'not_checked_in' end
  from public.participants p
  join public.teams t on t.id = p.team_id
  left join public.attendance a on a.participant_id = p.id and a.status = 'present' and a.session_key = 'main'
  where p.hackathon_id = h
    and (p.full_name ilike '%' || v_q || '%'
      or p.participant_code ilike '%' || v_q || '%'
      or t.name ilike '%' || v_q || '%'
      or t.team_code ilike '%' || v_q || '%'
      or lower(p.email) = lower(v_q))
  order by p.participant_code
  limit 25;
end;
$$;

create or replace function public.publish_id_card_template(p_name text, p_config jsonb)
returns public.id_card_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hackathon uuid := public.current_hackathon_id();
  v_version int;
  v_row public.id_card_templates;
begin
  if not public.has_permission('manage_event') or v_hackathon is null then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_config) <> 'object' then
    raise exception 'Template config must be an object' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('id_card_templates:' || v_hackathon::text));
  select coalesce(max(version), 0) + 1 into v_version from public.id_card_templates where hackathon_id = v_hackathon;
  update public.id_card_templates set is_active = false where hackathon_id = v_hackathon and is_active;
  insert into public.id_card_templates(hackathon_id, version, name, is_active, config, created_by)
  values (v_hackathon, v_version, coalesce(nullif(btrim(p_name), ''), 'Card template v' || v_version), true, p_config, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.rotate_qr_token(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('edit_registrations') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  update public.participants
     set qr_token = public.generate_opaque_token(), qr_revoked_at = null
   where id = p_participant_id and hackathon_id = public.current_hackathon_id();
end;
$$;

create or replace function public.set_team_leader(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  if not public.has_permission('edit_registrations') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select team_id into v_team from public.participants where id = p_participant_id and hackathon_id = public.current_hackathon_id();
  if v_team is null then
    raise exception 'Participant not found' using errcode = 'no_data_found';
  end if;
  update public.participants set role = 'member' where team_id = v_team and role = 'leader' and id <> p_participant_id;
  update public.participants set role = 'leader' where id = p_participant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform overview for the Super Admin: one row per hackathon.
-- ---------------------------------------------------------------------------
create or replace function public.platform_overview()
returns table (id uuid, name text, slug text, status text, organizer_name text, starts_at timestamptz, ends_at timestamptz,
               created_at timestamptz, teams bigint, participants bigint, staff bigint, present bigint,
               open_support bigint, last_activity timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  return query
  select h.id, h.name, h.slug, h.status, h.organizer_name, h.starts_at, h.ends_at, h.created_at,
         (select count(*) from public.teams t where t.hackathon_id = h.id),
         (select count(*) from public.participants p where p.hackathon_id = h.id),
         (select count(*) from public.profiles s where s.hackathon_id = h.id and s.role in ('admin', 'official') and s.status = 'active'),
         (select count(distinct a.participant_id) from public.attendance a where a.hackathon_id = h.id and a.status = 'present'),
         (select count(*) from public.support_requests r where r.hackathon_id = h.id and r.status not in ('resolved', 'closed')),
         (select max(l.created_at) from public.audit_logs l where l.hackathon_id = h.id)
  from public.hackathons h
  order by h.created_at desc;
end;
$$;

grant execute on function public.platform_overview() to authenticated;
revoke execute on function public.fill_hackathon_id(), public.profiles_fill_hackathon(), public.support_assignee_same_hackathon(),
  public.hackathons_before_write(), public.hackathons_guard_platform_fields() from public, anon, authenticated;
