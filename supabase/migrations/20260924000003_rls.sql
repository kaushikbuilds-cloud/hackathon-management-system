-- =============================================================================
-- Row Level Security & grants
-- Every table has RLS enabled. Privileged writes that must bypass RLS
-- (registration, PDF jobs, account management) run server-side with the
-- service role after explicit permission checks in application code.
-- =============================================================================

alter table public.hackathons               enable row level security;
alter table public.registration_forms       enable row level security;
alter table public.registration_submissions enable row level security;
alter table public.teams                    enable row level security;
alter table public.participants             enable row level security;
alter table public.profiles                 enable row level security;
alter table public.official_permissions     enable row level security;
alter table public.credential_events        enable row level security;
alter table public.id_card_templates        enable row level security;
alter table public.id_card_jobs             enable row level security;
alter table public.attendance               enable row level security;
alter table public.support_requests         enable row level security;
alter table public.support_messages         enable row level security;
alter table public.support_status_history   enable row level security;
alter table public.notifications            enable row level security;
alter table public.announcements            enable row level security;
alter table public.event_schedule           enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.rate_limits              enable row level security;

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants broadly by default; we tighten explicitly)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- anon: only public event info, published forms and public schedule.
grant select on public.hackathons, public.registration_forms, public.event_schedule to anon;

-- authenticated: table privileges; RLS decides the rows.
grant select on
  public.hackathons, public.registration_forms, public.registration_submissions, public.teams,
  public.participants, public.profiles, public.official_permissions, public.credential_events,
  public.id_card_templates, public.id_card_jobs, public.attendance, public.support_requests,
  public.support_messages, public.support_status_history, public.notifications, public.announcements,
  public.event_schedule, public.audit_logs, public.team_overview, public.participant_overview
to authenticated;

grant update on public.hackathons to authenticated;
grant insert, update, delete on public.registration_forms to authenticated;
grant update (name, college, status, status_reason, custom_answers) on public.teams to authenticated;
grant delete on public.teams to authenticated;
grant insert (team_id, full_name, email, phone, college, department, academic_year, role) on public.participants to authenticated;
grant update (full_name, email, phone, college, department, academic_year, role, photo_path, qr_revoked_at) on public.participants to authenticated;
grant delete on public.participants to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant insert (team_id, category, subject, description, contact_email, contact_phone, attachment_path) on public.support_requests to authenticated;
grant update (status, assigned_to) on public.support_requests to authenticated;
grant insert (request_id, body, is_internal) on public.support_messages to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert, update, delete on public.announcements, public.event_schedule to authenticated;

-- Helper and RPC functions callable by signed-in users (each checks roles itself).
grant execute on function
  public.current_app_role(), public.is_admin(), public.is_super_admin(), public.is_staff(),
  public.has_permission(text), public.my_team_id(), public.current_actor_id(),
  public.normalize_team_name(text), public.normalize_email(text),
  public.verify_qr(text, text), public.check_in(uuid, text, text), public.undo_check_in(uuid, text),
  public.publish_id_card_template(text, jsonb), public.support_transition_allowed(public.support_status, public.support_status),
  public.set_team_leader(uuid), public.rotate_qr_token(uuid)
to authenticated;
-- anon needs the helpers because policies shared with anon call them (they return false/null for anon).
grant execute on function
  public.normalize_team_name(text), public.normalize_email(text),
  public.current_app_role(), public.is_admin(), public.is_super_admin(), public.is_staff(),
  public.has_permission(text), public.my_team_id()
to anon;
-- register_team and check_rate_limit are deliberately service-role only.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- hackathons: public read; admins update.
create policy hackathons_read on public.hackathons for select to anon, authenticated using (true);
create policy hackathons_admin_update on public.hackathons for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- registration_forms
create policy forms_public_read on public.registration_forms for select to anon, authenticated
  using (status = 'published' or public.is_staff());
create policy forms_admin_insert on public.registration_forms for insert to authenticated with check (public.is_admin());
create policy forms_admin_update on public.registration_forms for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy forms_admin_delete on public.registration_forms for delete to authenticated using (public.is_admin());

create policy submissions_admin_read on public.registration_submissions for select to authenticated using (public.is_admin());

-- teams: staff read all; team members read their own team.
create policy teams_read on public.teams for select to authenticated
  using (public.is_staff() or id = public.my_team_id());
create policy teams_update on public.teams for update to authenticated
  using (public.has_permission('edit_registrations')) with check (public.has_permission('edit_registrations'));
create policy teams_delete on public.teams for delete to authenticated using (public.is_admin());

-- participants
create policy participants_read on public.participants for select to authenticated
  using (public.is_staff() or team_id = public.my_team_id());
create policy participants_insert on public.participants for insert to authenticated
  with check (public.has_permission('edit_registrations'));
create policy participants_update on public.participants for update to authenticated
  using (public.has_permission('edit_registrations')) with check (public.has_permission('edit_registrations'));
create policy participants_delete on public.participants for delete to authenticated using (public.is_admin());

-- profiles: own profile; staff can see staff + participants (names for assignment).
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy official_permissions_read on public.official_permissions for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create policy credential_events_read on public.credential_events for select to authenticated using (public.is_admin());

-- ID cards
create policy templates_read on public.id_card_templates for select to authenticated using (public.is_staff());
create policy jobs_read on public.id_card_jobs for select to authenticated using (public.is_staff());

-- attendance
create policy attendance_read on public.attendance for select to authenticated
  using (public.is_staff() or team_id = public.my_team_id());

-- support
create policy support_read on public.support_requests for select to authenticated
  using (
    public.has_permission('manage_all_support')
    or assigned_to = auth.uid()
    or team_id = public.my_team_id()
  );
create policy support_team_insert on public.support_requests for insert to authenticated
  with check (team_id = public.my_team_id() or public.is_admin());
create policy support_staff_update on public.support_requests for update to authenticated
  using (public.has_permission('manage_all_support') or assigned_to = auth.uid())
  with check (public.has_permission('manage_all_support') or assigned_to = auth.uid());

create policy support_messages_read on public.support_messages for select to authenticated
  using (
    exists (select 1 from public.support_requests r where r.id = request_id)
    and (not is_internal or public.is_staff())
  );
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    exists (select 1 from public.support_requests r where r.id = request_id)
    and (not is_internal or public.is_staff())
  );

create policy support_history_read on public.support_status_history for select to authenticated
  using (exists (select 1 from public.support_requests r where r.id = request_id));

-- notifications
create policy notifications_read on public.notifications for select to authenticated
  using (profile_id = auth.uid() or (team_id is not null and team_id = public.my_team_id()));
create policy notifications_update on public.notifications for update to authenticated
  using (profile_id = auth.uid() or (team_id is not null and team_id = public.my_team_id()))
  with check (profile_id = auth.uid() or (team_id is not null and team_id = public.my_team_id()));

-- announcements
create policy announcements_read on public.announcements for select to authenticated
  using (
    public.is_admin()
    or (status = 'published' and (
      audience = 'all'
      or (audience = 'staff' and public.is_staff())
      or (audience = 'participants' and (public.my_team_id() is not null or public.is_staff()))
    ))
  );
create policy announcements_admin_insert on public.announcements for insert to authenticated with check (public.is_admin());
create policy announcements_admin_update on public.announcements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy announcements_admin_delete on public.announcements for delete to authenticated using (public.is_admin());

-- schedule
create policy schedule_public_read on public.event_schedule for select to anon using (visibility = 'public');
create policy schedule_read on public.event_schedule for select to authenticated
  using (visibility <> 'staff' or public.is_staff());
create policy schedule_admin_insert on public.event_schedule for insert to authenticated with check (public.is_admin());
create policy schedule_admin_update on public.event_schedule for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy schedule_admin_delete on public.event_schedule for delete to authenticated using (public.is_admin());

-- audit logs: admins read; nobody writes directly (triggers / service role only).
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- rate_limits: no policies => no access except service role.
