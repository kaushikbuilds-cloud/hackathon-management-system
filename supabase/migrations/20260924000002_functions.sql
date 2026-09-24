-- =============================================================================
-- Functions, triggers and RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so they can read profiles without
-- recursing through RLS). All check that the profile is active.
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'super_admin', 'official'), false);
$$;

-- Permission check: admins implicitly hold every permission.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then true
    when public.current_app_role() = 'official' then coalesce((
      select case p_permission
        when 'edit_registrations' then op.can_edit_registrations
        when 'generate_pdf' then op.can_generate_pdf
        when 'correct_attendance' then op.can_correct_attendance
        when 'manage_all_support' then op.can_manage_all_support
        else false
      end
      from public.official_permissions op
      where op.profile_id = auth.uid()
    ), false)
    else false
  end;
$$;

-- Team of the logged-in participant (null for staff / anonymous).
create or replace function public.my_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id
  from public.profiles pr
  join public.participants p on p.id = pr.participant_id
  where pr.id = auth.uid() and pr.is_active and pr.role = 'participant';
$$;

-- Identify the acting user. Server-side code that uses the service role passes
-- the real actor in the `x-actor-id` request header; it is only trusted when
-- the request is authenticated as service_role.
create or replace function public.current_actor_id()
returns uuid
language plpgsql
stable
as $$
declare
  v_headers json;
  v_actor text;
begin
  if auth.uid() is not null then
    return auth.uid();
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role' then
    begin
      v_headers := nullif(current_setting('request.headers', true), '')::json;
      v_actor := v_headers ->> 'x-actor-id';
      if v_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return v_actor::uuid;
      end if;
    exception when others then
      return null;
    end;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'hackathons', 'registration_forms', 'teams', 'participants', 'profiles',
    'support_requests', 'announcements', 'event_schedule'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end;
$$;

-- Generic audit trigger: records changed columns (never secrets; tables audited
-- here contain no credentials).
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
      if v_key not in ('updated_at', 'name_key', 'email_key')
         and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - 'qr_token';
  else
    v_changes := v_old - 'qr_token';
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

do $$
declare
  t text;
begin
  foreach t in array array[
    'hackathons', 'registration_forms', 'teams', 'participants', 'profiles',
    'official_permissions', 'attendance', 'support_requests', 'id_card_templates',
    'announcements', 'event_schedule'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
                   t || '_audit', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Immutable identifiers: Team ID / Participant ID
-- ---------------------------------------------------------------------------
create or replace function public.format_code(p_prefix text, p_year int, p_n bigint)
returns text
language sql
immutable
as $$
  select p_prefix || '-' || p_year::text || '-' || lpad(p_n::text, greatest(4, length(p_n::text)), '0');
$$;

create or replace function public.assign_team_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_code is null then
    new.team_code := public.format_code('TEAM',
      (select id_year from public.hackathons where id = new.hackathon_id),
      nextval('public.team_code_seq'));
  end if;
  return new;
end;
$$;

create or replace function public.assign_participant_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Runs before participants_before_write (triggers fire alphabetically), so
  -- resolve the hackathon from the team here.
  new.hackathon_id := (select hackathon_id from public.teams where id = new.team_id);
  if new.participant_code is null then
    new.participant_code := public.format_code('PRT',
      (select id_year from public.hackathons where id = new.hackathon_id),
      nextval('public.participant_code_seq'));
  end if;
  return new;
end;
$$;

create or replace function public.prevent_code_change()
returns trigger
language plpgsql
as $$
begin
  -- Nested IFs: PL/pgSQL does not short-circuit record field lookups, and
  -- each table only has its own code column.
  if tg_table_name = 'teams' then
    if new.team_code is distinct from old.team_code then
      raise exception 'Team ID is immutable' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'participants' then
    if new.participant_code is distinct from old.participant_code then
      raise exception 'Participant ID is immutable' using errcode = 'check_violation';
    end if;
  end if;
  if new.hackathon_id is distinct from old.hackathon_id then
    raise exception 'hackathon_id is immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger teams_assign_code before insert on public.teams
  for each row execute function public.assign_team_code();
create trigger teams_immutable_code before update on public.teams
  for each row execute function public.prevent_code_change();
create trigger participants_assign_code before insert on public.participants
  for each row execute function public.assign_participant_code();
create trigger participants_immutable_code before update on public.participants
  for each row execute function public.prevent_code_change();

-- Participants inherit hackathon_id from their team; moving teams is not allowed
-- to keep card output and attendance history coherent.
create or replace function public.participants_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select hackathon_id into new.hackathon_id from public.teams where id = new.team_id;
  elsif new.team_id is distinct from old.team_id then
    raise exception 'Participants cannot be moved between teams' using errcode = 'check_violation';
  end if;
  new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  new.email := public.normalize_email(new.email);
  return new;
end;
$$;
create trigger participants_before_write before insert or update on public.participants
  for each row execute function public.participants_before_write();

create or replace function public.teams_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  return new;
end;
$$;
create trigger teams_before_write before insert or update of name on public.teams
  for each row execute function public.teams_before_write();

-- ---------------------------------------------------------------------------
-- ID-card PDF outdated-state tracking
-- ---------------------------------------------------------------------------
create or replace function public.mark_team_pdf_outdated(p_team_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.teams set pdf_status = 'outdated'
  where id = p_team_id and pdf_status = 'generated';
$$;

create or replace function public.participants_pdf_outdated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.mark_team_pdf_outdated(new.team_id);
  elsif tg_op = 'DELETE' then
    perform public.mark_team_pdf_outdated(old.team_id);
  elsif (new.full_name, new.college, new.department, new.academic_year, new.role, new.photo_path, new.qr_token)
        is distinct from
        (old.full_name, old.college, old.department, old.academic_year, old.role, old.photo_path, old.qr_token) then
    perform public.mark_team_pdf_outdated(new.team_id);
  end if;
  return null;
end;
$$;
create trigger participants_pdf_outdated after insert or update or delete on public.participants
  for each row execute function public.participants_pdf_outdated();

create or replace function public.teams_pdf_outdated()
returns trigger
language plpgsql
as $$
begin
  if (new.name, new.college) is distinct from (old.name, old.college) and new.pdf_status = 'generated'
     and old.pdf_status = new.pdf_status then
    new.pdf_status := 'outdated';
  end if;
  return new;
end;
$$;
create trigger teams_pdf_outdated before update on public.teams
  for each row execute function public.teams_pdf_outdated();

create or replace function public.hackathon_pdf_outdated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.name, new.tagline, new.logo_path, new.organizer_name, new.organizer_logo_path,
      new.starts_at, new.ends_at, new.venue, new.primary_color, new.accent_color, new.timezone)
     is distinct from
     (old.name, old.tagline, old.logo_path, old.organizer_name, old.organizer_logo_path,
      old.starts_at, old.ends_at, old.venue, old.primary_color, old.accent_color, old.timezone) then
    update public.teams set pdf_status = 'outdated' where hackathon_id = new.id and pdf_status = 'generated';
  end if;
  return null;
end;
$$;
create trigger hackathon_pdf_outdated after update on public.hackathons
  for each row execute function public.hackathon_pdf_outdated();

create or replace function public.template_pdf_outdated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    update public.teams set pdf_status = 'outdated' where hackathon_id = new.hackathon_id and pdf_status = 'generated';
  end if;
  return null;
end;
$$;
create trigger id_card_templates_pdf_outdated after insert or update on public.id_card_templates
  for each row execute function public.template_pdf_outdated();

-- Publish a new immutable template version and make it the active one.
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
  if not public.is_admin() then
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

-- ---------------------------------------------------------------------------
-- New auth user -> profile. Role / participant link come from app_metadata,
-- which only the service role can set.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role := coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'participant')::public.app_role;
  v_participant uuid := nullif(new.raw_app_meta_data ->> 'participant_id', '')::uuid;
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_app_meta_data ->> 'full_name');
begin
  if v_role <> 'participant' then
    v_participant := null;
  end if;
  if v_participant is not null and v_name is null then
    select full_name into v_name from public.participants where id = v_participant;
  end if;
  insert into public.profiles(id, email, full_name, role, participant_id, must_change_password, temp_password_expires_at)
  values (
    new.id, new.email, v_name, v_role, v_participant,
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, false),
    nullif(new.raw_app_meta_data ->> 'temp_password_expires_at', '')::timestamptz
  )
  on conflict (id) do nothing;
  if v_participant is not null then
    update public.participants set user_id = new.id where id = v_participant and user_id is null;
  end if;
  if v_role = 'official' then
    insert into public.official_permissions(profile_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Supabase Auth (GoTrue) inserts the user row first and writes custom
-- app_metadata in a follow-up UPDATE, so keep the profile in sync whenever a
-- server-controlled app_metadata key changes.
create or replace function public.handle_auth_user_metadata_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := coalesce(old.raw_app_meta_data, '{}'::jsonb);
  v_new jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_role public.app_role;
  v_participant uuid;
begin
  insert into public.profiles(id, email) values (new.id, new.email) on conflict (id) do nothing;

  if (v_new ->> 'role') is distinct from (v_old ->> 'role') and nullif(v_new ->> 'role', '') is not null then
    v_role := (v_new ->> 'role')::public.app_role;
    update public.profiles
       set role = v_role,
           participant_id = case when v_role = 'participant' then participant_id end
     where id = new.id;
    if v_role = 'official' then
      insert into public.official_permissions(profile_id) values (new.id) on conflict do nothing;
    end if;
  end if;

  if (v_new ->> 'participant_id') is distinct from (v_old ->> 'participant_id') and nullif(v_new ->> 'participant_id', '') is not null then
    v_participant := (v_new ->> 'participant_id')::uuid;
    update public.profiles set participant_id = v_participant
     where id = new.id and role = 'participant';
    update public.participants set user_id = new.id where id = v_participant and user_id is null;
    update public.profiles p set full_name = coalesce(p.full_name, pa.full_name)
      from public.participants pa where p.id = new.id and pa.id = v_participant;
  end if;

  if (v_new ->> 'must_change_password') is distinct from (v_old ->> 'must_change_password') and (v_new ? 'must_change_password') then
    update public.profiles set must_change_password = coalesce((v_new ->> 'must_change_password')::boolean, false) where id = new.id;
  end if;
  if (v_new ->> 'temp_password_expires_at') is distinct from (v_old ->> 'temp_password_expires_at') and (v_new ? 'temp_password_expires_at') then
    update public.profiles set temp_password_expires_at = nullif(v_new ->> 'temp_password_expires_at', '')::timestamptz where id = new.id;
  end if;

  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  if (new.raw_user_meta_data ->> 'full_name') is not null then
    update public.profiles set full_name = new.raw_user_meta_data ->> 'full_name' where id = new.id and full_name is null;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of raw_app_meta_data, raw_user_meta_data, email on auth.users
  for each row execute function public.handle_auth_user_metadata_update();

-- Users may only change harmless profile columns themselves.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  -- Service-role writes (auth.uid() is null) and super admins are unrestricted.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  if public.is_admin() then
    -- Admins manage officials/participants, but never administrator accounts
    -- (including promoting anyone - themselves included - to admin).
    if new.role is distinct from old.role
       and (old.role in ('admin', 'super_admin') or new.role in ('admin', 'super_admin')) then
      raise exception 'Only a super admin can change administrator roles' using errcode = 'insufficient_privilege';
    end if;
    if new.id <> auth.uid() and old.role in ('admin', 'super_admin') then
      raise exception 'Only a super admin can manage administrator accounts' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.participant_id is distinct from old.participant_id
     or new.must_change_password is distinct from old.must_change_password
     or new.temp_password_expires_at is distinct from old.temp_password_expires_at then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Registration (atomic + idempotent). Called only by the server (service role)
-- after rate limiting and schema validation. Re-validates everything critical.
--
-- p_payload = {
--   "team_name": text, "college": text, "answers": {..},
--   "members": [{ "full_name", "email", "phone", "college", "department",
--                 "academic_year", "role": "leader"|"member" }]
-- }
-- Returns { ok, team_id, team_code, participant_codes[], replayed } or
--         { ok:false, code, message, field? }
-- ---------------------------------------------------------------------------
create or replace function public.register_team(p_form_slug text, p_payload jsonb, p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.registration_forms;
  v_existing public.registration_submissions;
  v_team public.teams;
  v_members jsonb := coalesce(p_payload -> 'members', '[]'::jsonb);
  v_count int;
  v_leaders int;
  v_member jsonb;
  v_codes text[] := '{}';
  v_code text;
  v_constraint text;
  v_detail text;
  v_error jsonb;
  v_now timestamptz := now();
begin
  select * into v_form from public.registration_forms where slug = p_form_slug;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'form_not_found', 'message', 'Registration form not found.');
  end if;

  -- Idempotent replay: a retried submission returns the original result.
  if p_idempotency_key is not null then
    select * into v_existing from public.registration_submissions
      where idempotency_key = p_idempotency_key and status = 'accepted';
    if found then
      select * into v_team from public.teams where id = v_existing.team_id;
      return jsonb_build_object('ok', true, 'replayed', true, 'team_id', v_team.id, 'team_code', v_team.team_code,
        'team_name', v_team.name,
        'participant_codes', (select coalesce(jsonb_agg(participant_code order by role, participant_code), '[]'::jsonb)
                              from public.participants where team_id = v_team.id));
    end if;
  end if;

  begin
    if v_form.status <> 'published'
       or (v_form.opens_at is not null and v_now < v_form.opens_at)
       or (v_form.closes_at is not null and v_now > v_form.closes_at) then
      raise exception using errcode = 'P0001', message = 'registration_closed';
    end if;

    if jsonb_typeof(v_members) <> 'array' then
      raise exception using errcode = 'P0001', message = 'invalid_members';
    end if;
    v_count := jsonb_array_length(v_members);
    if v_count < v_form.min_team_size or v_count > v_form.max_team_size then
      raise exception using errcode = 'P0001', message = 'team_size';
    end if;
    select count(*) into v_leaders from jsonb_array_elements(v_members) m where m ->> 'role' = 'leader';
    if v_leaders <> 1 then
      raise exception using errcode = 'P0001', message = 'leader_count';
    end if;
    if (select count(distinct public.normalize_email(m ->> 'email')) from jsonb_array_elements(v_members) m) <> v_count then
      raise exception using errcode = 'P0001', message = 'duplicate_member_email';
    end if;

    -- Claim the idempotency key first so concurrent retries serialise on it.
    insert into public.registration_submissions(form_id, idempotency_key, status, payload)
    values (v_form.id, p_idempotency_key, 'accepted', p_payload - 'members' || jsonb_build_object('member_count', v_count))
    returning * into v_existing;

    insert into public.teams(hackathon_id, form_id, name, college, status, custom_answers)
    values (
      v_form.hackathon_id, v_form.id,
      p_payload ->> 'team_name',
      nullif(btrim(p_payload ->> 'college'), ''),
      case when v_form.requires_approval then 'pending'::public.registration_status else 'approved'::public.registration_status end,
      coalesce(p_payload -> 'answers', '{}'::jsonb)
    )
    returning * into v_team;

    for v_member in select value from jsonb_array_elements(v_members) order by (value ->> 'role') <> 'leader' loop
      insert into public.participants(team_id, full_name, email, phone, college, department, academic_year, role)
      values (
        v_team.id,
        v_member ->> 'full_name',
        v_member ->> 'email',
        nullif(btrim(v_member ->> 'phone'), ''),
        coalesce(nullif(btrim(v_member ->> 'college'), ''), v_team.college),
        nullif(btrim(v_member ->> 'department'), ''),
        nullif(btrim(v_member ->> 'academic_year'), ''),
        (v_member ->> 'role')::public.member_role
      )
      returning participant_code into v_code;
      v_codes := v_codes || v_code;
    end loop;

    update public.registration_submissions set team_id = v_team.id where id = v_existing.id;

    return jsonb_build_object('ok', true, 'replayed', false, 'team_id', v_team.id, 'team_code', v_team.team_code,
                              'team_name', v_team.name, 'participant_codes', to_jsonb(v_codes));
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name, v_detail = pg_exception_detail;
      if v_constraint = 'registration_submissions_idempotency_key_key' then
        -- A concurrent request with the same key committed first: replay it.
        return public.register_team(p_form_slug, p_payload, p_idempotency_key);
      elsif v_constraint = 'teams_name_key_unique' then
        v_error := jsonb_build_object('ok', false, 'code', 'duplicate_team_name', 'field', 'team_name',
          'message', 'A team with this name is already registered. Please choose a different team name.');
      elsif v_constraint = 'participants_email_unique' then
        v_error := jsonb_build_object('ok', false, 'code', 'participant_already_registered', 'field', 'members',
          'message', 'One of the member email addresses is already registered in another team: '
                     || coalesce(substring(v_detail from '\(hackathon_id, email_key\)=\([^,]+, ([^)]+)\)'), 'unknown') || '.');
      else
        v_error := jsonb_build_object('ok', false, 'code', 'conflict', 'message', 'The registration conflicts with existing data.');
      end if;
    when raise_exception then
      v_error := case sqlerrm
        when 'registration_closed' then jsonb_build_object('ok', false, 'code', sqlerrm, 'message', 'Registration is not open.')
        when 'team_size' then jsonb_build_object('ok', false, 'code', sqlerrm, 'field', 'members',
          'message', format('Teams must have between %s and %s members.', v_form.min_team_size, v_form.max_team_size))
        when 'leader_count' then jsonb_build_object('ok', false, 'code', sqlerrm, 'field', 'members', 'message', 'Exactly one team leader is required.')
        when 'duplicate_member_email' then jsonb_build_object('ok', false, 'code', sqlerrm, 'field', 'members', 'message', 'Each member must use a different email address.')
        else jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Invalid registration.')
      end;
    when check_violation or not_null_violation or invalid_text_representation then
      v_error := jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Some fields are invalid. Please review the form.');
  end;

  -- Record the rejected attempt (without an idempotency key so a corrected retry is possible).
  insert into public.registration_submissions(form_id, status, payload, errors)
  values (v_form.id, 'rejected',
          jsonb_build_object('team_name', p_payload ->> 'team_name',
                             'member_count', case when jsonb_typeof(v_members) = 'array' then jsonb_array_length(v_members) else 0 end),
          v_error);
  return v_error;
end;
$$;

-- ---------------------------------------------------------------------------
-- QR verification & attendance
-- ---------------------------------------------------------------------------
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
  if not public.is_staff() then
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
  if not public.is_staff() then
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
   where id = p_attendance_id and status = 'present'
  returning * into v_row;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'No active check-in found.');
  end if;
  return jsonb_build_object('ok', true, 'attendance_id', v_row.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Support request workflow
-- ---------------------------------------------------------------------------
create or replace function public.support_transition_allowed(p_from public.support_status, p_to public.support_status)
returns boolean
language sql
immutable
as $$
  select p_from = p_to or (p_from, p_to) in (
    ('new', 'assigned'), ('new', 'in_progress'), ('new', 'closed'),
    ('assigned', 'in_progress'), ('assigned', 'resolved'), ('assigned', 'closed'),
    ('in_progress', 'resolved'), ('in_progress', 'closed'),
    ('resolved', 'closed'), ('resolved', 'in_progress')
  );
$$;

create or replace function public.support_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_staff() then
      -- Teams create requests only for themselves, always starting as `new`.
      new.team_id := public.my_team_id();
      new.created_by := auth.uid();
      new.status := 'new';
      new.assigned_to := null;
      if new.team_id is null then
        raise exception 'No team for current user' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if new.assigned_to is not null and new.status = 'new' then
      new.status := 'assigned';
    end if;
    return new;
  end if;

  if new.team_id is distinct from old.team_id or new.created_by is distinct from old.created_by then
    raise exception 'Immutable support fields' using errcode = 'check_violation';
  end if;
  if new.assigned_to is distinct from old.assigned_to and auth.uid() is not null
     and not public.has_permission('manage_all_support') then
    raise exception 'Only administrators can assign support requests' using errcode = 'insufficient_privilege';
  end if;
  if new.assigned_to is not null and old.assigned_to is null and new.status = 'new' then
    new.status := 'assigned';
  end if;
  if not public.support_transition_allowed(old.status, new.status) then
    raise exception 'Invalid status transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_at := now();
  end if;
  return new;
end;
$$;
create trigger support_requests_before_write before insert or update on public.support_requests
  for each row execute function public.support_requests_before_write();

create or replace function public.support_requests_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to then
    insert into public.support_status_history(request_id, from_status, to_status, assigned_to, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, new.assigned_to, public.current_actor_id());
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.notifications(team_id, title, body, link)
    values (new.team_id, 'Support request updated',
            format('"%s" is now %s.', new.subject, replace(new.status::text, '_', ' ')),
            '/portal/support/' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    insert into public.notifications(profile_id, title, body, link)
    values (new.assigned_to, 'Support request assigned to you', new.subject, '/staff/support/' || new.id);
  end if;
  return null;
end;
$$;
create trigger support_requests_after_write after insert or update on public.support_requests
  for each row execute function public.support_requests_after_write();

create or replace function public.support_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    if not public.is_staff() then
      new.is_internal := false;
    end if;
  end if;
  return new;
end;
$$;
create trigger support_messages_before_insert before insert on public.support_messages
  for each row execute function public.support_messages_before_insert();

create or replace function public.support_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.support_requests;
  v_author_role public.app_role;
begin
  select * into v_req from public.support_requests where id = new.request_id;
  update public.support_requests set updated_at = now() where id = new.request_id;
  select role into v_author_role from public.profiles where id = new.author_id;
  if not new.is_internal and v_author_role in ('admin', 'super_admin', 'official') then
    insert into public.notifications(team_id, title, body, link)
    values (v_req.team_id, 'New response to your support request', v_req.subject, '/portal/support/' || v_req.id);
  elsif v_author_role = 'participant' and v_req.assigned_to is not null then
    insert into public.notifications(profile_id, title, body, link)
    values (v_req.assigned_to, 'Team replied to a support request', v_req.subject, '/staff/support/' || v_req.id);
  end if;
  return null;
end;
$$;
create trigger support_messages_after_insert after insert on public.support_messages
  for each row execute function public.support_messages_after_insert();

-- Announcement publish timestamp
create or replace function public.announcements_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger announcements_before_write before insert or update on public.announcements
  for each row execute function public.announcements_before_write();

create or replace function public.registration_forms_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger registration_forms_before_write before insert or update on public.registration_forms
  for each row execute function public.registration_forms_before_write();

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window), service role only.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits int;
begin
  insert into public.rate_limits as r(key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  -- Opportunistic cleanup of stale windows.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker => callers' RLS applies)
-- ---------------------------------------------------------------------------
create view public.team_overview with (security_invoker = true) as
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
  coalesce(m.member_search, '') as member_search
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

create view public.participant_overview with (security_invoker = true) as
select
  p.id, p.hackathon_id, p.team_id, p.participant_code, p.full_name, p.email, p.phone, p.college, p.department,
  p.academic_year, p.role, p.photo_path, p.qr_revoked_at, p.user_id, p.created_at,
  t.name as team_name, t.team_code, t.status as team_status,
  a.id as attendance_id, a.checked_in_at,
  case
    when a.id is not null then 'present'
    when exists (select 1 from public.attendance c where c.participant_id = p.id and c.status = 'corrected') then 'corrected'
    else 'not_checked_in'
  end as attendance_state
from public.participants p
join public.teams t on t.id = p.team_id
left join public.attendance a on a.participant_id = p.id and a.status = 'present' and a.session_key = 'main';

-- ---------------------------------------------------------------------------
-- Team membership helpers (atomic multi-row changes)
-- ---------------------------------------------------------------------------
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
  select team_id into v_team from public.participants where id = p_participant_id;
  if v_team is null then
    raise exception 'Participant not found' using errcode = 'no_data_found';
  end if;
  update public.participants set role = 'member' where team_id = v_team and role = 'leader' and id <> p_participant_id;
  update public.participants set role = 'leader' where id = p_participant_id;
end;
$$;

-- Issues a new QR verification token (old printed cards stop verifying).
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
   where id = p_participant_id;
end;
$$;
