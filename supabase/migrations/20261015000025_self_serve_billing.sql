-- Self-serve hackathons: an organiser signs up, pays for one hackathon with
-- Razorpay, and the hackathon is created for them once the payment is
-- verified. The Super Admin sets the price. All writes go through the server.

create table if not exists public.platform_settings (
  id                    boolean primary key default true check (id),
  hackathon_price_paise integer not null default 29900 check (hackathon_price_paise between 100 and 100000000),
  currency              text not null default 'INR' check (currency = 'INR'),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles(id) on delete set null
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_settings alter column hackathon_price_paise set default 29900;
update public.platform_settings set hackathon_price_paise = 29900 where hackathon_price_paise = 299900;
alter table public.platform_settings enable row level security;
grant select on public.platform_settings to anon, authenticated;
grant all on public.platform_settings to service_role;
drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings for select to anon, authenticated using (true);

create table if not exists public.hackathon_orders (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid references public.profiles(id) on delete set null,
  email               text not null,
  organiser_name      text not null check (length(btrim(organiser_name)) between 2 and 100),
  organisation        text not null check (length(btrim(organisation)) between 2 and 150),
  hackathon_name      text not null check (length(btrim(hackathon_name)) between 2 and 120),
  amount_paise        integer not null check (amount_paise > 0),
  currency            text not null default 'INR',
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  status              text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  hackathon_id        uuid references public.hackathons(id) on delete set null,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists hackathon_orders_profile_idx on public.hackathon_orders (profile_id, created_at desc);
alter table public.hackathon_orders enable row level security;
grant select on public.hackathon_orders to authenticated;
grant all on public.hackathon_orders to service_role;
drop policy if exists hackathon_orders_read on public.hackathon_orders;
create policy hackathon_orders_read on public.hackathon_orders for select to authenticated
  using (profile_id = auth.uid() or public.is_super_admin());

-- Marks an order paid and creates its hackathon in one transaction. Safe to
-- call twice (checkout handler and webhook): the second call returns the same
-- hackathon. Server only.
create or replace function public.provision_paid_hackathon(p_razorpay_order text, p_payment text, p_template jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o public.hackathon_orders;
  v_h uuid;
begin
  select * into o from public.hackathon_orders where razorpay_order_id = p_razorpay_order for update;
  if not found then raise exception 'Unknown order %', p_razorpay_order; end if;
  if o.hackathon_id is not null then return o.hackathon_id; end if;
  if o.profile_id is null or not exists (select 1 from public.profiles where id = o.profile_id and role = 'admin') then
    raise exception 'The order has no organiser account';
  end if;

  insert into public.hackathons (name, organizer_name, status, created_by, timezone, contact_email, id_year)
  values (btrim(o.hackathon_name), btrim(o.organisation), 'active', o.profile_id, 'Asia/Kolkata', o.email, extract(year from now())::int)
  returning id into v_h;
  insert into public.id_card_templates (hackathon_id, version, name, is_active, config, created_by)
  values (v_h, 1, 'Default card', true, p_template, o.profile_id);

  update public.profiles set hackathon_id = v_h, status = 'active' where id = o.profile_id;
  insert into public.staff_permissions (profile_id, permission)
  select o.profile_id, key from public.permissions where 'admin'::public.app_role = any (grantable_to)
  on conflict do nothing;

  update public.hackathon_orders
     set status = 'paid', razorpay_payment_id = coalesce(razorpay_payment_id, p_payment), paid_at = coalesce(paid_at, now()), hackathon_id = v_h
   where id = o.id;
  insert into public.notifications (profile_id, title, body, link)
  select p.id, 'New hackathon purchased', format('%s (%s) paid for %s.', o.organiser_name, o.organisation, o.hackathon_name), '/staff/payments'
  from public.profiles p where p.role = 'super_admin';
  return v_h;
end;
$$;
revoke execute on function public.provision_paid_hackathon(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.provision_paid_hackathon(text, text, jsonb) to service_role;
