-- BSB Digital Menu — Phase 7 waiter order entry (additive).
-- Does not drop tables, does not change qr_token, does not create KOT/bills/payments.

-- Waiter can read their restaurant menu for order entry even if public slug is missing.
drop policy if exists "waiters read own categories" on public.categories;
create policy "waiters read own categories"
  on public.categories for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "waiters read own menu_items" on public.menu_items;
create policy "waiters read own menu_items"
  on public.menu_items for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

create or replace function public.assert_waiter_or_owner(p_restaurant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_restaurant_owner(p_restaurant_id) then
    return;
  end if;
  if public.current_waiter_restaurant_id() is not distinct from p_restaurant_id then
    return;
  end if;
  raise exception 'Not allowed';
end;
$$;

create or replace function public.next_session_number(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.assert_waiter_or_owner(p_restaurant_id);
  select coalesce(max(nullif(regexp_replace(session_number, '\D', '', 'g'), '')::integer), 0) + 1
    into v_n
  from public.table_sessions
  where restaurant_id = p_restaurant_id;
  return 'S' || lpad(v_n::text, 3, '0');
end;
$$;

create or replace function public.next_order_number(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.assert_waiter_or_owner(p_restaurant_id);
  select coalesce(max(nullif(regexp_replace(order_number, '\D', '', 'g'), '')::integer), 0) + 1
    into v_n
  from public.orders
  where restaurant_id = p_restaurant_id;
  return lpad(v_n::text, 3, '0');
end;
$$;

revoke all on function public.assert_waiter_or_owner(uuid) from public;
revoke all on function public.next_session_number(uuid) from public;
revoke all on function public.next_order_number(uuid) from public;

grant execute on function public.assert_waiter_or_owner(uuid) to authenticated;
grant execute on function public.next_session_number(uuid) to authenticated;
grant execute on function public.next_order_number(uuid) to authenticated;

-- Allow a waiter to discard a brand-new order if line items fail to insert.
drop policy if exists "waiters delete own new orders" on public.orders;
create policy "waiters delete own new orders"
  on public.orders for delete
  to authenticated
  using (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
    and waiter_id = public.current_waiter_id()
    and status = 'new'
  );
