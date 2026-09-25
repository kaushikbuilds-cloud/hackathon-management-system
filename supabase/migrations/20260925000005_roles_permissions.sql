-- =============================================================================
-- Roles & permissions v2 (per "User Roles, Account Creation & Portal Workflow")
--
-- * Granular permissions: Admins no longer get everything implicitly; only the
--   Super Admin does. Admins and Officials hold explicit grants.
-- * Single-use, expiring invitations (hashed tokens) for Admins, Officials,
--   participant activation and password resets.
-- * Account status lifecycle: active / suspended / deactivated.
-- * Official duties & stations.
-- * Data minimisation: Officials use narrow lookup RPCs instead of reading
--   participants; team members see a roster, only Team Leaders see full rows.
-- Safe to run on a database that already has migrations 001–004 and data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Account status lifecycle
-- ---------------------------------------------------------------------------
create type public.account_status as enum ('active', 'suspended', 'deactivated');

alter table public.profiles
  add column status    public.account_status not null default 'active',
  add column phone     text check (phone is null or char_length(phone) <= 30),
  add column job_title text check (job_title is null or char_length(job_title) <= 100);

update public.profiles set status = case when is_active then 'active'::public.account_status else 'deactivated'::public.account_status end;

-- Keep the legacy is_active flag in sync with status (both directions).
create or replace function public.profiles_sync_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.is_active := new.status = 'active';
  elsif new.status is distinct from old.status then
    new.is_active := new.status = 'active';
  elsif new.is_active is distinct from old.is_active then
    new.status := case when new.is_active then 'active'::public.account_status else 'deactivated'::public.account_status end;
  end if;
  return new;
end;
$$;
create trigger profiles_a_sync_status before insert or update on public.profiles
  for each row execute function public.profiles_sync_status();

-- Portal ID cards ("My ID card" / leader's team PDF) are opt-in.
alter table public.hackathons add column portal_id_cards boolean not null default false;

-- ---------------------------------------------------------------------------
-- Permissions catalogue and grants
-- ---------------------------------------------------------------------------
create table public.permissions (
  key          text primary key,
  label        text not null,
  description  text not null,
  -- Which staff roles may be granted this permission.
  grantable_to public.app_role[] not null,
  -- Granted automatically when an account of that role is invited.
  default_for  public.app_role[] not null default '{}',
  sort_order   int not null default 0
);

insert into public.permissions (key, label, description, grantable_to, default_for, sort_order) values
  ('manage_event',          'Event settings',             'Edit event setup, branding and the ID card template.',              '{admin}',          '{admin}', 10),
  ('manage_registrations',  'Registration management',    'Build and publish forms, view submissions, approve/reject teams.',  '{admin}',          '{admin}', 20),
  ('edit_registrations',    'Correct registrations',      'Correct team and participant details (audited).',                  '{admin,official}', '{admin}', 30),
  ('view_participants',     'Full participant data',      'See all teams and participants including contact details.',        '{admin}',          '{admin}', 40),
  ('generate_pdf',          'Generate ID cards',          'Generate and download team ID card PDFs.',                         '{admin,official}', '{admin}', 50),
  ('record_attendance',     'QR check-in',                'Scan ID card QR codes and confirm check-in.',                      '{admin,official}', '{admin,official}', 60),
  ('manual_checkin',        'Manual check-in',            'Search participants by name/ID and check them in manually.',       '{admin,official}', '{admin}', 70),
  ('correct_attendance',    'Correct attendance',         'Undo/correct check-ins with a reason (audited).',                  '{admin,official}', '{admin}', 80),
  ('view_attendance',       'Attendance dashboard',       'See everyone''s attendance, not just own check-ins.',              '{admin,official}', '{admin}', 90),
  ('manage_officials',      'Manage Officials',           'Invite, suspend and set permissions for Officials.',               '{admin}',          '{}',      100),
  ('publish_announcements', 'Announcements & schedule',   'Create, publish and archive announcements and schedule items.',    '{admin}',          '{admin}', 110),
  ('manage_all_support',    'All support requests',       'See, assign and handle every support request.',                    '{admin,official}', '{admin}', 120),
  ('view_reports',          'Reports & exports',          'Dashboard statistics and CSV exports.',                            '{admin}',          '{admin}', 130);

create table public.staff_permissions (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  permission  text not null references public.permissions(key) on delete cascade,
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (profile_id, permission)
);

-- Grants must match the holder's role (e.g. Officials can never hold manage_officials).
create or replace function public.staff_permissions_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_allowed public.app_role[];
begin
  select role into v_role from public.profiles where id = new.profile_id;
  select grantable_to into v_allowed from public.permissions where key = new.permission;
  if v_role is null or v_role = 'super_admin' or not (v_role = any (v_allowed)) then
    raise exception 'Permission % cannot be granted to role %', new.permission, coalesce(v_role::text, 'unknown')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger staff_permissions_check before insert or update on public.staff_permissions
  for each row execute function public.staff_permissions_check();

-- Backfill: existing Officials keep what they could do before (QR + manual
-- check-in, plus their old flags); existing Admins keep full access.
insert into public.staff_permissions (profile_id, permission)
select p.id, x.perm
from public.profiles p
cross join lateral (values ('record_attendance'), ('manual_checkin')) as x(perm)
where p.role = 'official'
on conflict do nothing;

insert into public.staff_permissions (profile_id, permission)
select op.profile_id, x.perm
from public.official_permissions op
join public.profiles p on p.id = op.profile_id and p.role = 'official'
cross join lateral (values
  (case when op.can_edit_registrations then 'edit_registrations' end),
  (case when op.can_generate_pdf then 'generate_pdf' end),
  (case when op.can_correct_attendance then 'correct_attendance' end),
  (case when op.can_manage_all_support then 'manage_all_support' end)
) as x(perm)
where x.perm is not null
on conflict do nothing;

insert into public.staff_permissions (profile_id, permission)
select p.id, pm.key
from public.profiles p cross join public.permissions pm
where p.role = 'admin'
on conflict do nothing;

-- Role changes drop grants that no longer apply.
create or replace function public.profiles_role_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    delete from public.staff_permissions sp
     using public.permissions pm
     where sp.profile_id = new.id and pm.key = sp.permission
       and (new.role = 'super_admin' or not (new.role = any (pm.grantable_to)));
  end if;
  return null;
end;
$$;
create trigger profiles_role_changed after update of role on public.profiles
  for each row execute function public.profiles_role_changed();

-- ---------------------------------------------------------------------------
-- Official duties / stations
-- ---------------------------------------------------------------------------
create table public.official_assignments (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  duty        text check (duty is null or char_length(duty) <= 150),
  station     text check (station is null or char_length(station) <= 100),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Invitations (single-use, expiring). Only a SHA-256 hash of the token is
-- stored; the raw token exists only in the link handed to the invitee.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  purpose         text not null default 'activate' check (purpose in ('activate', 'reset')),
  role            public.app_role not null check (role in ('admin', 'official', 'participant')),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name       text check (full_name is null or char_length(full_name) <= 100),
  phone           text check (phone is null or char_length(phone) <= 30),
  job_title       text check (job_title is null or char_length(job_title) <= 100),
  participant_id  uuid references public.participants(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete cascade,
  permissions     text[] not null default '{}',
  duty            text check (duty is null or char_length(duty) <= 150),
  station         text check (station is null or char_length(station) <= 100),
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles(id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references public.profiles(id) on delete set null,
  invited_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (role <> 'participant' or participant_id is not null or purpose = 'reset'),
  check (purpose <> 'reset' or profile_id is not null)
);
create index invitations_email_idx on public.invitations (lower(email));
create index invitations_created_idx on public.invitations (created_at desc);

create trigger invitations_audit after insert or update or delete on public.invitations
  for each row execute function public.audit_row_change();
create trigger staff_permissions_audit after insert or update or delete on public.staff_permissions
  for each row execute function public.audit_row_change();
create trigger official_assignments_audit after insert or update or delete on public.official_assignments
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Authorization helpers v2
-- ---------------------------------------------------------------------------
-- Only the Super Admin holds every permission implicitly.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin() then true
    when public.current_app_role() in ('admin', 'official') then exists (
      select 1 from public.staff_permissions sp
      where sp.profile_id = auth.uid() and sp.permission = p_permission)
    else false
  end;
$$;

create or replace function public.my_participant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pr.participant_id from public.profiles pr
  where pr.id = auth.uid() and pr.is_active and pr.role = 'participant';
$$;

create or replace function public.is_team_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role = 'leader' from public.participants p where p.id = public.my_participant_id()), false);
$$;

-- Approving / rejecting / flagging needs manage_registrations (editing details
-- only needs edit_registrations).
create or replace function public.teams_status_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and new.status is distinct from old.status
     and not public.has_permission('manage_registrations') then
    raise exception 'Not allowed to change registration status' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger teams_status_guard before update of status on public.teams
  for each row execute function public.teams_status_guard();

-- ---------------------------------------------------------------------------
-- Narrow, data-minimised RPCs
-- ---------------------------------------------------------------------------
-- Manual check-in lookup for Officials: identity + team only, no contacts.
create or replace function public.lookup_participants(p_query text)
returns table (
  id uuid, participant_code text, full_name text, role public.member_role, college text, department text,
  team_id uuid, team_name text, team_code text, team_status public.registration_status,
  attendance_id uuid, checked_in_at timestamptz, attendance_state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if not (public.has_permission('manual_checkin') or public.has_permission('view_participants')) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_q) < 2 then
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
  where p.full_name ilike '%' || v_q || '%'
     or p.participant_code ilike '%' || v_q || '%'
     or t.name ilike '%' || v_q || '%'
     or t.team_code ilike '%' || v_q || '%'
     or lower(p.email) = lower(v_q)
  order by p.participant_code
  limit 25;
end;
$$;

-- Team roster for any member of the team (no contact details).
create or replace function public.my_team_roster()
returns table (id uuid, participant_code text, full_name text, role public.member_role, attendance_state text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.participant_code, p.full_name, p.role,
         case when exists (select 1 from public.attendance a where a.participant_id = p.id and a.status = 'present' and a.session_key = 'main')
              then 'present'
              when exists (select 1 from public.attendance c where c.participant_id = p.id and c.status = 'corrected') then 'corrected'
              else 'not_checked_in' end
  from public.participants p
  where p.team_id = public.my_team_id()
  order by (p.role <> 'leader'), p.participant_code;
$$;

-- Aggregate statistics only (no personal data) for dashboards/reports.
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.has_permission('view_reports') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'teams', (select count(*) from public.teams),
    'participants', (select count(*) from public.participants),
    'present', (select count(distinct participant_id) from public.attendance where status = 'present' and session_key = 'main'),
    'pending_approvals', (select count(*) from public.teams where status = 'pending'),
    'staff', (select count(*) from public.profiles where role in ('admin', 'official') and status = 'active'),
    'pending_invitations', (select count(*) from public.invitations where accepted_at is null and revoked_at is null and expires_at > now()),
    'open_support', (select count(*) from public.support_requests where status not in ('resolved', 'closed')),
    'registration', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.teams group by status) s), '{}'),
    'pdf', coalesce((select jsonb_object_agg(pdf_status, n) from (select pdf_status, count(*) n from public.teams group by pdf_status) s), '{}'),
    'support', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.support_requests group by status) s), '{}'),
    'teams_by_college', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(btrim(college), ''), 'Unspecified') k, count(*) n from public.teams group by 1) s), '{}'),
    'participants_by_department', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(btrim(department), ''), 'Unspecified') k, count(*) n from public.participants group by 1) s), '{}'),
    'team_attendance', coalesce((select jsonb_object_agg(attendance_state, n) from (select attendance_state, count(*) n from public.team_overview group by 1) s), '{}'),
    'recent_activity', coalesce((select jsonb_agg(jsonb_build_object('action', action, 'at', created_at) order by created_at desc)
                                 from (select action, created_at from public.audit_logs order by created_at desc limit 8) r), '[]')
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing functions updated for granular permissions
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_actor uuid := public.current_actor_id();
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'name_key', 'email_key', 'token_hash')
         and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - 'qr_token' - 'token_hash';
  else
    v_changes := v_old - 'qr_token' - 'token_hash';
  end if;

  -- QR tokens are verification secrets: never copy them into the audit log.
  if v_changes ? 'qr_token' then
    v_changes := jsonb_set(v_changes, '{qr_token}', '"[rotated]"'::jsonb);
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, details)
  values (
    v_actor,
    (select role::text from public.profiles where id = v_actor),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'profile_id', v_old ->> 'profile_id'),
    v_changes
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.publish_id_card_template(p_name text, p_config jsonb)
returns public.id_card_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hackathon uuid;
  v_version int;
  v_row public.id_card_templates;
begin
  if not public.has_permission('manage_event') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_config) <> 'object' then
    raise exception 'Template config must be an object' using errcode = 'check_violation';
  end if;
  select id into v_hackathon from public.hackathons limit 1;
  perform pg_advisory_xact_lock(hashtext('id_card_templates'));
  select coalesce(max(version), 0) + 1 into v_version from public.id_card_templates where hackathon_id = v_hackathon;
  update public.id_card_templates set is_active = false where hackathon_id = v_hackathon and is_active;
  insert into public.id_card_templates(hackathon_id, version, name, is_active, config, created_by)
  values (v_hackathon, v_version, coalesce(nullif(btrim(p_name), ''), 'Card template v' || v_version), true, p_config, auth.uid())
  returning * into v_row;
  return v_row;
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
  select * into v_p from public.participants where qr_token = p_token;
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
  -- QR check-in and manual (search-based) check-in are separate permissions.
  if not public.has_permission(case when p_method = 'qr' then 'record_attendance' else 'manual_checkin' end) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select * into v_p from public.participants where id = p_participant_id;
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
    insert into public.attendance(participant_id, team_id, session_key, method, recorded_by)
    values (v_p.id, v_p.team_id, p_session, p_method, auth.uid())
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
-- ---------------------------------------------------------------------------
-- RLS & grants for the new tables
-- ---------------------------------------------------------------------------
alter table public.permissions          enable row level security;
alter table public.staff_permissions    enable row level security;
alter table public.official_assignments enable row level security;
alter table public.invitations          enable row level security;

grant select on public.permissions, public.staff_permissions, public.official_assignments, public.invitations to authenticated;
grant all on public.permissions, public.staff_permissions, public.official_assignments, public.invitations to service_role;
revoke all on public.permissions, public.staff_permissions, public.official_assignments, public.invitations from anon;
grant update (full_name, phone) on public.profiles to authenticated;

create policy permissions_read on public.permissions for select to authenticated using (public.is_staff());
create policy staff_permissions_read on public.staff_permissions for select to authenticated
  using (profile_id = auth.uid() or public.is_super_admin()
         or (public.has_permission('manage_officials')
             and exists (select 1 from public.profiles p where p.id = profile_id and p.role = 'official')));
create policy official_assignments_read on public.official_assignments for select to authenticated
  using (profile_id = auth.uid() or public.is_super_admin() or public.has_permission('manage_officials'));
-- Invitations are written only by the server (service role) after permission checks.
create policy invitations_read on public.invitations for select to authenticated
  using (public.is_super_admin() or (role = 'official' and public.has_permission('manage_officials')));

grant execute on function
  public.my_participant_id(), public.is_team_leader(), public.lookup_participants(text),
  public.my_team_roster(), public.dashboard_stats()
to authenticated;
grant execute on function public.my_participant_id(), public.is_team_leader() to anon;
revoke execute on function public.staff_permissions_check(), public.profiles_role_changed(), public.teams_status_guard(),
  public.profiles_sync_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Existing policies rewritten against granular permissions
-- ---------------------------------------------------------------------------
drop policy hackathons_admin_update on public.hackathons;
create policy hackathons_update on public.hackathons for update to authenticated
  using (public.has_permission('manage_event')) with check (public.has_permission('manage_event'));

drop policy forms_admin_insert on public.registration_forms;
drop policy forms_admin_update on public.registration_forms;
drop policy forms_admin_delete on public.registration_forms;
create policy forms_insert on public.registration_forms for insert to authenticated with check (public.has_permission('manage_registrations'));
create policy forms_update on public.registration_forms for update to authenticated
  using (public.has_permission('manage_registrations')) with check (public.has_permission('manage_registrations'));
create policy forms_delete on public.registration_forms for delete to authenticated using (public.has_permission('manage_registrations'));

drop policy submissions_admin_read on public.registration_submissions;
create policy submissions_read on public.registration_submissions for select to authenticated using (public.has_permission('manage_registrations'));

drop policy teams_update on public.teams;
drop policy teams_delete on public.teams;
create policy teams_update on public.teams for update to authenticated
  using (public.has_permission('edit_registrations') or public.has_permission('manage_registrations'))
  with check (public.has_permission('edit_registrations') or public.has_permission('manage_registrations'));
create policy teams_delete on public.teams for delete to authenticated using (public.has_permission('manage_registrations'));

-- Participants: full rows for holders of view_participants / edit_registrations,
-- own row for every participant, whole team only for the Team Leader.
drop policy participants_read on public.participants;
drop policy participants_delete on public.participants;
create policy participants_read on public.participants for select to authenticated
  using (
    public.has_permission('view_participants')
    or public.has_permission('edit_registrations')
    or id = public.my_participant_id()
    or (team_id = public.my_team_id() and public.is_team_leader())
  );
create policy participants_delete on public.participants for delete to authenticated using (public.has_permission('manage_registrations'));

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_super_admin()
    or (role in ('admin', 'official') and public.is_staff())
    or (role = 'participant' and public.has_permission('view_participants'))
  );

drop policy official_permissions_read on public.official_permissions;
create policy official_permissions_read on public.official_permissions for select to authenticated
  using (profile_id = auth.uid() or public.is_super_admin());

drop policy credential_events_read on public.credential_events;
create policy credential_events_read on public.credential_events for select to authenticated
  using (public.is_super_admin() or public.has_permission('manage_officials') or public.has_permission('view_participants'));

drop policy jobs_read on public.id_card_jobs;
create policy jobs_read on public.id_card_jobs for select to authenticated
  using (public.has_permission('generate_pdf') or public.has_permission('view_participants'));

drop policy attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
  using (
    public.has_permission('view_attendance')
    or recorded_by = auth.uid()
    or participant_id = public.my_participant_id()
    or (team_id = public.my_team_id() and public.is_team_leader())
  );

drop policy announcements_read on public.announcements;
drop policy announcements_admin_insert on public.announcements;
drop policy announcements_admin_update on public.announcements;
drop policy announcements_admin_delete on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (
    public.has_permission('publish_announcements')
    or (status = 'published' and (
      audience = 'all'
      or (audience = 'staff' and public.is_staff())
      or (audience = 'participants' and (public.my_team_id() is not null or public.is_staff()))
    ))
  );
create policy announcements_insert on public.announcements for insert to authenticated with check (public.has_permission('publish_announcements'));
create policy announcements_update on public.announcements for update to authenticated
  using (public.has_permission('publish_announcements')) with check (public.has_permission('publish_announcements'));
create policy announcements_delete on public.announcements for delete to authenticated using (public.has_permission('publish_announcements'));

drop policy schedule_admin_insert on public.event_schedule;
drop policy schedule_admin_update on public.event_schedule;
drop policy schedule_admin_delete on public.event_schedule;
create policy schedule_insert on public.event_schedule for insert to authenticated with check (public.has_permission('publish_announcements'));
create policy schedule_update on public.event_schedule for update to authenticated
  using (public.has_permission('publish_announcements')) with check (public.has_permission('publish_announcements'));
create policy schedule_delete on public.event_schedule for delete to authenticated using (public.has_permission('publish_announcements'));

-- Audit log: Super Admin sees everything; people who correct registrations see
-- the change history of teams and participants.
drop policy audit_admin_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
  using (
    public.is_super_admin()
    or (entity_type in ('teams', 'participants') and public.has_permission('edit_registrations'))
  );

-- Credential events cover the new lifecycle and invitation actions.
alter table public.credential_events drop constraint credential_events_event_type_check;
alter table public.credential_events add constraint credential_events_event_type_check check (event_type in (
  'invite_sent', 'temp_password_issued', 'password_reset_sent', 'password_changed',
  'account_deactivated', 'account_reactivated', 'account_suspended',
  'invitation_created', 'invitation_accepted', 'invitation_revoked'));

-- Names for attendance rows the caller can already see (no contact details).
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
    and exists (
      select 1 from public.attendance a
      where a.participant_id = p.id
        and (public.has_permission('view_attendance') or a.recorded_by = auth.uid())
    );
$$;
grant execute on function public.attendance_names(uuid[]) to authenticated;
