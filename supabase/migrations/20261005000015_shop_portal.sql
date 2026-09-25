-- Shop portal: every food shop gets its own login (Shop ID + password set up
-- by the organisers). A shop sees only its own orders, accepts or rejects
-- them, moves them to ready / collected, opens or closes itself and edits its
-- own menu and prices. Team orders now start as "waiting for the shop".

alter type public.app_role add value if not exists 'vendor';
commit; -- a new enum value must be committed before it is used

alter table public.profiles add column if not exists shop_id uuid references public.food_shops(id) on delete cascade;
create unique index if not exists profiles_shop_account_unique on public.profiles (shop_id) where shop_id is not null;
alter table public.profiles drop constraint if exists profiles_shop_account_role;
alter table public.profiles add constraint profiles_shop_account_role check (shop_id is null or role = 'vendor');

-- Only the server links a login to a shop; the login inherits the shop's hackathon.
create or replace function public.profiles_shop_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and new.shop_id is distinct from old.shop_id then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if new.shop_id is not null then
    select hackathon_id into new.hackathon_id from public.food_shops where id = new.shop_id;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_shop_guard on public.profiles;
create trigger profiles_shop_guard before insert or update on public.profiles
  for each row execute function public.profiles_shop_guard();
revoke execute on function public.profiles_shop_guard() from public, anon, authenticated;

create or replace function public.my_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select pr.shop_id from public.profiles pr where pr.id = auth.uid() and pr.is_active and pr.role = 'vendor';
$$;
grant execute on function public.my_shop_id() to authenticated;

-- Shop IDs: the hackathon's prefix + S + number (SAMPLE1-S01).
alter table public.hackathon_code_counters add column if not exists shops integer not null default 0;
alter table public.food_shops add column if not exists code text;
create or replace function public.food_shops_assign_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.code is null then
    insert into public.hackathon_code_counters as c (hackathon_id, shops) values (new.hackathon_id, 1)
      on conflict (hackathon_id) do update set shops = c.shops + 1 returning c.shops into n;
    new.code := (select code_prefix from public.hackathons where id = new.hackathon_id) || '-S' || lpad(n::text, 2, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists food_shops_assign_code on public.food_shops;
create trigger food_shops_assign_code before insert or update of code on public.food_shops
  for each row execute function public.food_shops_assign_code();
update public.food_shops set code = null where code is null;
create unique index if not exists food_shops_code_unique on public.food_shops (code);
revoke execute on function public.food_shops_assign_code() from public, anon, authenticated;

-- Shops accept or reject orders; a rejection carries a reason.
alter table public.food_orders drop constraint if exists food_orders_status_check;
alter table public.food_orders add constraint food_orders_status_check
  check (status in ('placed', 'preparing', 'ready', 'collected', 'cancelled', 'rejected'));
alter table public.food_orders add column if not exists reject_reason text check (length(reject_reason) <= 200);

drop policy if exists food_orders_read on public.food_orders;
create policy food_orders_read on public.food_orders for select to authenticated
  using (hackathon_id = public.current_hackathon_id()
         and (participant_id in (select p.id from public.participants p where p.team_id = public.my_team_id())
              or shop_id = public.my_shop_id()
              or public.has_permission('manage_food')));
drop policy if exists food_items_shop_manage on public.food_items;
create policy food_items_shop_manage on public.food_items for all to authenticated
  using (shop_id = public.my_shop_id())
  with check (shop_id = public.my_shop_id() and hackathon_id = public.current_hackathon_id());

-- Counter workflow for shop logins and food staff: accept (preparing) or
-- reject with a reason, then ready, then collected.
drop function if exists public.set_food_order_status(uuid, text);
create or replace function public.set_food_order_status(p_order uuid, p_status text, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_from text;
  v_shop uuid;
begin
  select status, shop_id into v_from, v_shop from public.food_orders
   where id = p_order and hackathon_id = public.current_hackathon_id() for update;
  if v_from is null then return false; end if;
  if not (public.has_permission('manage_food') or coalesce(v_shop = public.my_shop_id(), false)) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'rejected' and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for rejecting the order' using errcode = 'check_violation';
  end if;
  if not ((v_from = 'placed' and p_status in ('preparing', 'ready', 'rejected', 'cancelled'))
       or (v_from = 'preparing' and p_status in ('ready', 'cancelled'))
       or (v_from = 'ready' and p_status in ('collected', 'cancelled'))) then
    return false;
  end if;
  update public.food_orders
     set status = p_status, handled_by = auth.uid(), updated_at = now(),
         reject_reason = case when p_status = 'rejected' then left(btrim(p_reason), 200) end
   where id = p_order;
  return true;
end;
$$;
revoke execute on function public.set_food_order_status(uuid, text, text) from public, anon;
grant execute on function public.set_food_order_status(uuid, text, text) to authenticated;

-- A shop login opens or closes its own counter (other shop details stay with the organisers).
create or replace function public.set_my_shop_open(p_open boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.food_shops set is_open = p_open where id = public.my_shop_id();
  return found;
end;
$$;
revoke execute on function public.set_my_shop_open(boolean) from public, anon;
grant execute on function public.set_my_shop_open(boolean) to authenticated;

-- Rejected orders do not count toward per-person limits or food totals.
create or replace function public.place_food_order(p_shop uuid, p_items jsonb, p_note text default null, p_member uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid := coalesce(p_member, public.my_participant_id());
  v_h uuid := public.current_hackathon_id();
  v_shop public.food_shops;
  v_item public.food_items;
  v_order uuid;
  v_no int;
  v_total numeric(10,2) := 0;
  v_lines int := 0;
  v_had int;
  r record;
begin
  if v_h is null or public.my_team_id() is null then
    return jsonb_build_object('ok', false, 'code', 'not_authorized', 'message', 'Sign in to the team portal to order food.');
  end if;
  if v_pid is null or not exists (select 1 from public.participants p where p.id = v_pid and p.team_id = public.my_team_id()) then
    return jsonb_build_object('ok', false, 'code', 'choose_member', 'message', 'Choose which team member this order is for.');
  end if;
  if exists (select 1 from public.teams t where t.id = public.my_team_id() and t.status = 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'team_rejected', 'message', 'Your team registration was not approved.');
  end if;
  select * into v_shop from public.food_shops where id = p_shop and hackathon_id = v_h;
  if v_shop.id is null or not v_shop.is_open then
    return jsonb_build_object('ok', false, 'code', 'shop_closed', 'message', 'This counter is not taking orders right now.');
  end if;
  perform pg_advisory_xact_lock(hashtext('food_order:' || v_pid::text));
  if (select count(*) from public.food_orders where participant_id = v_pid and status in ('placed', 'preparing', 'ready')) >= 3 then
    return jsonb_build_object('ok', false, 'code', 'too_many_open', 'message', 'This member already has 3 open orders. Collect or cancel one first.');
  end if;
  for r in select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'qty')::int) as qty
           from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e group by 1 loop
    v_lines := v_lines + 1;
    select * into v_item from public.food_items where id = r.item_id and shop_id = p_shop;
    if v_item.id is null or not v_item.is_available then
      return jsonb_build_object('ok', false, 'code', 'item_unavailable', 'message', 'An item in your order is no longer available.');
    end if;
    if r.qty < 1 or r.qty > 20 then
      return jsonb_build_object('ok', false, 'code', 'bad_qty', 'message', 'Choose between 1 and 20 of each item.');
    end if;
    if v_item.limit_per_person is not null then
      select coalesce(sum(oi.qty), 0) into v_had from public.food_order_items oi join public.food_orders o on o.id = oi.order_id
       where o.participant_id = v_pid and o.status not in ('cancelled', 'rejected') and oi.item_id = v_item.id;
      if v_had + r.qty > v_item.limit_per_person then
        return jsonb_build_object('ok', false, 'code', 'limit_reached',
          'message', format('%s is limited to %s per person (this member has %s already).', v_item.name, v_item.limit_per_person, v_had));
      end if;
    end if;
    v_total := v_total + case when v_shop.is_free then 0 else v_item.price * r.qty end;
  end loop;
  if v_lines = 0 or v_lines > 15 then
    return jsonb_build_object('ok', false, 'code', 'empty', 'message', 'Add at least one item (up to 15 different items).');
  end if;
  insert into public.hackathon_code_counters as c (hackathon_id, food_orders) values (v_h, 1)
    on conflict (hackathon_id) do update set food_orders = c.food_orders + 1 returning c.food_orders into v_no;
  insert into public.food_orders (hackathon_id, shop_id, participant_id, order_no, is_free, total, note)
  values (v_h, p_shop, v_pid, v_no, v_shop.is_free, v_total, nullif(left(btrim(coalesce(p_note, '')), 200), ''))
  returning id into v_order;
  insert into public.food_order_items (order_id, item_id, name, price, qty)
  select v_order, i.id, i.name, case when v_shop.is_free then 0 else i.price end, x.qty
  from (select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'qty')::int) as qty
        from jsonb_array_elements(p_items) e group by 1) x
  join public.food_items i on i.id = x.item_id;
  return jsonb_build_object('ok', true, 'order_id', v_order, 'order_no', v_no, 'total', v_total);
end;
$$;
revoke execute on function public.place_food_order(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.place_food_order(uuid, jsonb, text, uuid) to authenticated;

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
    union all select o.hackathon_id, o.created_at, 'food', 1 from public.food_orders o where o.status not in ('cancelled', 'rejected')
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
