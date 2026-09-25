-- Order tracking: remember when each step happened so teams see a timeline
-- (placed → accepted → ready → collected, with times).

alter table public.food_orders add column if not exists accepted_at timestamptz;
alter table public.food_orders add column if not exists ready_at timestamptz;
alter table public.food_orders add column if not exists collected_at timestamptz;

-- Orders already past a step get their last update time as a best guess.
update public.food_orders set accepted_at = updated_at where accepted_at is null and status in ('preparing', 'ready', 'collected');
update public.food_orders set ready_at = updated_at where ready_at is null and status in ('ready', 'collected');
update public.food_orders set collected_at = updated_at where collected_at is null and status = 'collected';

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
         reject_reason = case when p_status = 'rejected' then left(btrim(p_reason), 200) end,
         accepted_at = case when p_status in ('preparing', 'ready') then coalesce(accepted_at, now()) else accepted_at end,
         ready_at = case when p_status = 'ready' then now() else ready_at end,
         collected_at = case when p_status = 'collected' then now() else collected_at end
   where id = p_order;
  return true;
end;
$$;
revoke execute on function public.set_food_order_status(uuid, text, text) from public, anon;
grant execute on function public.set_food_order_status(uuid, text, text) to authenticated;
