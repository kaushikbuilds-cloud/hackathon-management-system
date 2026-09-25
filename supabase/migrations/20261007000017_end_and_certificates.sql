-- Ending a hackathon and certificates.
-- * The hackathon's Admin (manage_event) presses "End hackathon": status
--   becomes completed, forms and food shops close. The Super Admin can reopen.
-- * Certificates: participation for everyone who checked in; teams with an
--   award (Winner, Best UI, ...) get a certificate of achievement instead.

alter table public.hackathons add column if not exists ended_at timestamptz;
alter table public.hackathons add column if not exists ended_by uuid references public.profiles(id) on delete set null;
alter table public.hackathons add column if not exists cert_signatory1_name text check (length(cert_signatory1_name) <= 80);
alter table public.hackathons add column if not exists cert_signatory1_title text check (length(cert_signatory1_title) <= 80);
alter table public.hackathons add column if not exists cert_signatory2_name text check (length(cert_signatory2_name) <= 80);
alter table public.hackathons add column if not exists cert_signatory2_title text check (length(cert_signatory2_title) <= 80);
alter table public.hackathons add column if not exists cert_signature1_path text;
alter table public.hackathons add column if not exists cert_signature2_path text;
alter table public.hackathons add column if not exists cert_note text check (length(cert_note) <= 200);
alter table public.teams add column if not exists award text check (length(btrim(award)) between 1 and 60);

-- The platform-fields guard lets end_hackathon() change the status on the
-- Admin's behalf (the flag is only set inside that function).
create or replace function public.hackathons_guard_platform_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin()
     and coalesce(current_setting('app.ending_hackathon', true), '') <> 'on'
     and (new.status is distinct from old.status or new.created_by is distinct from old.created_by
          or new.ended_at is distinct from old.ended_at or new.ended_by is distinct from old.ended_by) then
    raise exception 'Only the platform owner can change the hackathon status' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.end_hackathon()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_h uuid := public.current_hackathon_id();
begin
  if v_h is null or not public.has_permission('manage_event') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.ending_hackathon', 'on', true);
  update public.hackathons set status = 'completed', ended_at = now(), ended_by = auth.uid()
   where id = v_h and status <> 'completed';
  if not found then return false; end if;
  update public.registration_forms set status = 'closed' where hackathon_id = v_h and status = 'published';
  update public.food_shops set is_open = false where hackathon_id = v_h;
  perform set_config('app.ending_hackathon', 'off', true);
  return true;
end;
$$;

-- Only the platform owner can reopen a hackathon that was ended by mistake.
create or replace function public.reopen_hackathon(p_hackathon uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  update public.hackathons set status = 'active', ended_at = null, ended_by = null where id = p_hackathon and status = 'completed';
  return found;
end;
$$;

revoke execute on function public.end_hackathon(), public.reopen_hackathon(uuid) from public, anon;
grant execute on function public.end_hackathon(), public.reopen_hackathon(uuid) to authenticated;

-- Who gets which certificate: checked-in members of teams that were not
-- rejected; the team's award (if any) turns it into a certificate of achievement.
create or replace view public.certificate_recipients with (security_invoker = true) as
select p.id as participant_id, p.hackathon_id, p.participant_code, p.full_name, p.college,
       t.id as team_id, t.team_code, t.name as team_name, t.award,
       (select min(a.checked_in_at) from public.attendance a where a.participant_id = p.id and a.status = 'present') as checked_in_at
from public.participants p
join public.teams t on t.id = p.team_id
where t.status <> 'rejected'
  and exists (select 1 from public.attendance a where a.participant_id = p.id and a.status = 'present');
grant select on public.certificate_recipients to authenticated, service_role;

-- Private storage for large downloads (full exports, certificate ZIPs), handed out as short-lived links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 52428800, array['application/zip', 'application/pdf'])
on conflict (id) do nothing;
