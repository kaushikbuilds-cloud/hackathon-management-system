-- One portal login per team: every member's ID card carries the Team ID and
-- the team's one-time activation code; the team sets one shared password.
-- A team account is a participant profile with team_id set (participant_id
-- stays null). Older per-member accounts keep working.

alter table public.profiles add column if not exists team_id uuid references public.teams(id) on delete cascade;
create unique index if not exists profiles_team_account_unique on public.profiles (team_id) where team_id is not null;
alter table public.profiles drop constraint if exists profiles_team_account_role;
alter table public.profiles add constraint profiles_team_account_role
  check (team_id is null or (role = 'participant' and participant_id is null));

-- Only the server (service role) links an account to a team; the account
-- inherits the team's hackathon.
create or replace function public.profiles_team_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and new.team_id is distinct from old.team_id then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if new.team_id is not null then
    select hackathon_id into new.hackathon_id from public.teams where id = new.team_id;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_team_guard on public.profiles;
create trigger profiles_team_guard before insert or update on public.profiles
  for each row execute function public.profiles_team_guard();
revoke execute on function public.profiles_team_guard() from public, anon, authenticated;

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(pr.team_id, p.team_id)
  from public.profiles pr
  left join public.participants p on p.id = pr.participant_id
  where pr.id = auth.uid() and pr.is_active and pr.role = 'participant';
$$;

-- The shared team login acts for the whole team (it can do what the leader can).
create or replace function public.is_team_leader()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select pr.team_id is not null from public.profiles pr
                    where pr.id = auth.uid() and pr.is_active and pr.role = 'participant'), false)
      or coalesce((select p.role = 'leader' from public.participants p where p.id = public.my_participant_id()), false);
$$;

create table if not exists public.team_activation_codes (
  team_id    uuid primary key references public.teams(id) on delete cascade,
  code       text not null check (code ~ '^[A-HJ-KM-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
alter table public.team_activation_codes enable row level security;
grant all on public.team_activation_codes to service_role;

-- Food: the team login says which member an order is for, so per-person
-- limits still apply per person.
drop policy if exists food_orders_read on public.food_orders;
create policy food_orders_read on public.food_orders for select to authenticated
  using (hackathon_id = public.current_hackathon_id()
         and (participant_id in (select p.id from public.participants p where p.team_id = public.my_team_id())
              or public.has_permission('manage_food')));

create or replace function public.cancel_food_order(p_order uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.food_orders o set status = 'cancelled', updated_at = now()
   where o.id = p_order and o.status = 'placed'
     and exists (select 1 from public.participants p where p.id = o.participant_id and p.team_id = public.my_team_id());
  return found;
end;
$$;

drop function if exists public.place_food_order(uuid, jsonb, text);
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
       where o.participant_id = v_pid and o.status <> 'cancelled' and oi.item_id = v_item.id;
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
