-- Owner's month-end report: activity per hackathon per month (Super Admin only).
-- Months are counted in the given time zone (India by default).

create or replace function public.platform_monthly_report(p_from date, p_to date, p_tz text default 'Asia/Kolkata')
returns table (month date, hackathon_id uuid, hackathon_name text, teams bigint, participants bigint, checked_in bigint,
               fees_verified numeric, fees_pending bigint, food_orders bigint, food_revenue numeric, support_opened bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_to < p_from or p_to - p_from > 800 then
    raise exception 'Choose a range of at most two years' using errcode = 'check_violation';
  end if;
  return query
  with ev as (
    select t.hackathon_id h, t.created_at ts, 'team' k, 1::numeric v from public.teams t
    union all select p.hackathon_id, p.created_at, 'participant', 1 from public.participants p
    union all select a.hackathon_id, min(a.checked_in_at), 'checkin', 1 from public.attendance a
      where a.status = 'present' group by a.hackathon_id, a.participant_id
    union all select t.hackathon_id, t.payment_verified_at, 'fee', coalesce(t.payment_amount, 0) from public.teams t
      where t.payment_status = 'verified' and t.payment_verified_at is not null
    union all select t.hackathon_id, t.payment_submitted_at, 'fee_pending', 1 from public.teams t
      where t.payment_status = 'submitted' and t.payment_submitted_at is not null
    union all select o.hackathon_id, o.created_at, 'food', 1 from public.food_orders o where o.status <> 'cancelled'
    union all select o.hackathon_id, o.updated_at, 'food_revenue', o.total from public.food_orders o
      where o.status = 'collected' and not o.is_free
    union all select s.hackathon_id, s.created_at, 'support', 1 from public.support_requests s
  ), m as (
    select date_trunc('month', ev.ts at time zone p_tz)::date mo, ev.h, ev.k, ev.v from ev
    where ev.h is not null and (ev.ts at time zone p_tz)::date >= date_trunc('month', p_from)::date
      and (ev.ts at time zone p_tz)::date < (date_trunc('month', p_to) + interval '1 month')::date
  )
  select m.mo, m.h, hk.name,
         count(*) filter (where m.k = 'team'), count(*) filter (where m.k = 'participant'),
         count(*) filter (where m.k = 'checkin'),
         coalesce(sum(m.v) filter (where m.k = 'fee'), 0), count(*) filter (where m.k = 'fee_pending'),
         count(*) filter (where m.k = 'food'), coalesce(sum(m.v) filter (where m.k = 'food_revenue'), 0),
         count(*) filter (where m.k = 'support')
  from m join public.hackathons hk on hk.id = m.h
  group by m.mo, m.h, hk.name
  order by m.mo desc, hk.name;
end;
$$;
revoke execute on function public.platform_monthly_report(date, date, text) from public, anon;
grant execute on function public.platform_monthly_report(date, date, text) to authenticated;
