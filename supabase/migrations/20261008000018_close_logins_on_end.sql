-- When a hackathon ends, everything tied to it stops working for teams and
-- shops: team and member logins, shop logins and ID-card check-ins. Staff
-- keep access (data download, certificates); the Super Admin can reopen.

create or replace function public.hackathon_open(p_hackathon uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select h.status <> 'completed' from public.hackathons h where h.id = p_hackathon), true);
$$;
grant execute on function public.hackathon_open(uuid) to authenticated, anon;

-- Team, member and shop logins of an ended hackathon see nothing.
create or replace function public.current_hackathon_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case when p.role = 'super_admin' then public.requested_hackathon_id() else p.hackathon_id end
  from public.profiles p
  where p.id = auth.uid() and p.is_active
    and (p.role not in ('participant', 'vendor') or public.hackathon_open(p.hackathon_id));
$$;

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(pr.team_id, p.team_id)
  from public.profiles pr
  left join public.participants p on p.id = pr.participant_id
  where pr.id = auth.uid() and pr.is_active and pr.role = 'participant' and public.hackathon_open(pr.hackathon_id);
$$;

create or replace function public.my_participant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select pr.participant_id from public.profiles pr
  where pr.id = auth.uid() and pr.is_active and pr.role = 'participant' and public.hackathon_open(pr.hackathon_id);
$$;

create or replace function public.is_team_leader()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select pr.team_id is not null from public.profiles pr
                    where pr.id = auth.uid() and pr.is_active and pr.role = 'participant' and public.hackathon_open(pr.hackathon_id)), false)
      or coalesce((select p.role = 'leader' from public.participants p where p.id = public.my_participant_id()), false);
$$;

create or replace function public.my_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select pr.shop_id from public.profiles pr
  where pr.id = auth.uid() and pr.is_active and pr.role = 'vendor' and public.hackathon_open(pr.hackathon_id);
$$;

-- ID cards stop working: no check-ins or corrections once the hackathon has ended.
-- (Named so it runs after attendance_fill_hackathon has set hackathon_id.)
create or replace function public.attendance_closed_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.hackathon_open(coalesce(new.hackathon_id, old.hackathon_id)) then
    raise exception 'This hackathon has ended, so ID cards can no longer be used to check in.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists attendance_zz_closed_guard on public.attendance;
create trigger attendance_zz_closed_guard before insert or update or delete on public.attendance
  for each row execute function public.attendance_closed_guard();
revoke execute on function public.attendance_closed_guard() from public, anon, authenticated;
