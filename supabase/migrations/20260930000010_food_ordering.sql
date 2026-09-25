-- Food ordering: shops (free meals or paid, pay at the counter), menus with
-- optional per-person limits, participant orders and a counter workflow
-- (placed → preparing → ready → collected, or cancelled).

insert into public.permissions (key, label, description, grantable_to, default_for, sort_order) values
  ('manage_food', 'Food orders', 'Manage food shops and menus, and handle orders at the counter.', '{admin,official}', '{admin}', 130)
on conflict (key) do nothing;
insert into public.staff_permissions (profile_id, permission)
select p.id, 'manage_food' from public.profiles p where p.role = 'admin'
on conflict do nothing;

create table if not exists public.food_shops (
  id           uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 80),
  description  text check (length(description) <= 300),
  location     text check (length(location) <= 120),
  is_free      boolean not null default false,
  is_open      boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index if not exists food_shops_name_unique on public.food_shops (hackathon_id, lower(btrim(name)));

create table if not exists public.food_items (
  id               uuid primary key default gen_random_uuid(),
  hackathon_id     uuid not null references public.hackathons(id) on delete cascade,
  shop_id          uuid not null references public.food_shops(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 80),
  description      text check (length(description) <= 200),
  price            numeric(8,2) not null default 0 check (price between 0 and 100000),
  is_veg           boolean not null default true,
  is_available     boolean not null default true,
  limit_per_person integer check (limit_per_person between 1 and 50),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists food_items_shop_idx on public.food_items (shop_id);

create table if not exists public.food_orders (
  id             uuid primary key default gen_random_uuid(),
  hackathon_id   uuid not null references public.hackathons(id) on delete cascade,
  shop_id        uuid not null references public.food_shops(id) on delete restrict,
  participant_id uuid not null references public.participants(id) on delete cascade,
  order_no       integer not null,
  status         text not null default 'placed' check (status in ('placed', 'preparing', 'ready', 'collected', 'cancelled')),
  is_free        boolean not null,
  total          numeric(10,2) not null check (total >= 0),
  note           text check (length(note) <= 200),
  handled_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (hackathon_id, order_no)
);
create index if not exists food_orders_shop_status_idx on public.food_orders (shop_id, status, created_at);
create index if not exists food_orders_participant_idx on public.food_orders (participant_id, created_at desc);

create table if not exists public.food_order_items (
  id       bigint generated always as identity primary key,
  order_id uuid not null references public.food_orders(id) on delete cascade,
  item_id  uuid references public.food_items(id) on delete set null,
  name     text not null,
  price    numeric(8,2) not null,
  qty      integer not null check (qty between 1 and 20)
);
create index if not exists food_order_items_order_idx on public.food_order_items (order_id);
create index if not exists food_order_items_item_idx on public.food_order_items (item_id);

alter table public.hackathon_code_counters add column if not exists food_orders integer not null default 0;

alter table public.food_shops       enable row level security;
alter table public.food_items       enable row level security;
alter table public.food_orders      enable row level security;
alter table public.food_order_items enable row level security;
grant select, insert, update, delete on public.food_shops, public.food_items to authenticated;
grant select on public.food_orders, public.food_order_items to authenticated;
grant all on public.food_shops, public.food_items, public.food_orders, public.food_order_items to service_role;

drop policy if exists food_shops_read on public.food_shops;
create policy food_shops_read on public.food_shops for select to authenticated
  using (hackathon_id = public.current_hackathon_id());
drop policy if exists food_shops_manage on public.food_shops;
create policy food_shops_manage on public.food_shops for all to authenticated
  using (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_food'))
  with check (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_food'));

drop policy if exists food_items_read on public.food_items;
create policy food_items_read on public.food_items for select to authenticated
  using (hackathon_id = public.current_hackathon_id());
drop policy if exists food_items_manage on public.food_items;
create policy food_items_manage on public.food_items for all to authenticated
  using (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_food'))
  with check (hackathon_id = public.current_hackathon_id() and public.has_permission('manage_food')
              and exists (select 1 from public.food_shops s where s.id = shop_id and s.hackathon_id = food_items.hackathon_id));

drop policy if exists food_orders_read on public.food_orders;
create policy food_orders_read on public.food_orders for select to authenticated
  using (hackathon_id = public.current_hackathon_id()
         and (participant_id = public.my_participant_id() or public.has_permission('manage_food')));
drop policy if exists food_order_items_read on public.food_order_items;
create policy food_order_items_read on public.food_order_items for select to authenticated
  using (exists (select 1 from public.food_orders o where o.id = order_id));

create or replace function public.place_food_order(p_shop uuid, p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid := public.my_participant_id();
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
  if v_pid is null or v_h is null then
    return jsonb_build_object('ok', false, 'code', 'not_authorized', 'message', 'Sign in to the student portal to order food.');
  end if;
  if exists (select 1 from public.participants p join public.teams t on t.id = p.team_id where p.id = v_pid and t.status = 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'team_rejected', 'message', 'Your team registration was not approved.');
  end if;
  select * into v_shop from public.food_shops where id = p_shop and hackathon_id = v_h;
  if v_shop.id is null or not v_shop.is_open then
    return jsonb_build_object('ok', false, 'code', 'shop_closed', 'message', 'This counter is not taking orders right now.');
  end if;
  -- One order at a time per participant, so limits cannot be beaten by racing requests.
  perform pg_advisory_xact_lock(hashtext('food_order:' || v_pid::text));
  if (select count(*) from public.food_orders where participant_id = v_pid and status in ('placed', 'preparing', 'ready')) >= 3 then
    return jsonb_build_object('ok', false, 'code', 'too_many_open', 'message', 'You already have 3 open orders. Collect or cancel one first.');
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
          'message', format('%s is limited to %s per person (you have %s already).', v_item.name, v_item.limit_per_person, v_had));
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

create or replace function public.cancel_food_order(p_order uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.food_orders set status = 'cancelled', updated_at = now()
   where id = p_order and participant_id = public.my_participant_id() and status = 'placed';
  return found;
end;
$$;

create or replace function public.set_food_order_status(p_order uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_from text;
begin
  if not public.has_permission('manage_food') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select status into v_from from public.food_orders where id = p_order and hackathon_id = public.current_hackathon_id() for update;
  if v_from is null then return false; end if;
  if not ((v_from = 'placed' and p_status in ('preparing', 'ready', 'cancelled'))
       or (v_from = 'preparing' and p_status in ('ready', 'cancelled'))
       or (v_from = 'ready' and p_status in ('collected', 'cancelled'))) then
    return false;
  end if;
  update public.food_orders set status = p_status, handled_by = auth.uid(), updated_at = now() where id = p_order;
  return true;
end;
$$;

revoke execute on function public.place_food_order(uuid, jsonb, text), public.cancel_food_order(uuid),
  public.set_food_order_status(uuid, text) from public, anon;
grant execute on function public.place_food_order(uuid, jsonb, text), public.cancel_food_order(uuid),
  public.set_food_order_status(uuid, text) to authenticated;
