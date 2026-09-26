-- BSB Digital Menu — Phase 8 kitchen / KOT (additive).
-- Does not drop tables, does not change qr_token, does not create bills/payments.

-- One order produces exactly one KOT. Prevents duplicate tickets on retry.
create unique index if not exists kots_order_id_key on public.kots (order_id);

create or replace function public.next_kot_number(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.assert_waiter_or_owner(p_restaurant_id);
  select coalesce(max(nullif(regexp_replace(kot_number, '\D', '', 'g'), '')::integer), 0) + 1
    into v_n
  from public.kots
  where restaurant_id = p_restaurant_id;
  return lpad(v_n::text, 3, '0');
end;
$$;

revoke all on function public.next_kot_number(uuid) from public;
grant execute on function public.next_kot_number(uuid) to authenticated;

-- Kitchen status is owner-only. Waiters may insert/select tickets, not change status.
drop policy if exists "waiters update kots" on public.kots;
drop policy if exists "waiters update kot_items" on public.kot_items;

drop policy if exists "waiters delete own new kots" on public.kots;
create policy "waiters delete own new kots"
  on public.kots for delete
  to authenticated
  using (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
    and status = 'new'
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.waiter_id = public.current_waiter_id()
    )
  );

create or replace function public.submit_waiter_order(
  p_restaurant_id uuid,
  p_session_id uuid,
  p_table_id uuid,
  p_items jsonb,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waiter_id uuid;
  v_session public.table_sessions;
  v_order public.orders;
  v_kot public.kots;
  v_item jsonb;
  v_qty numeric;
  v_price numeric;
  v_name text;
  v_food text;
  v_has_item boolean := false;
  v_kot_type text;
  v_result jsonb;
begin
  v_waiter_id := public.current_waiter_id();
  if v_waiter_id is null or public.current_waiter_restaurant_id() is distinct from p_restaurant_id then
    raise exception 'Not allowed';
  end if;
  if not public.waiter_assigned_to_table(p_table_id) then
    raise exception 'You can only order on tables assigned to you.';
  end if;
  if not public.waiter_can_access_session(p_session_id) then
    raise exception 'You can only order on tables assigned to you.';
  end if;

  select * into v_session
  from public.table_sessions
  where id = p_session_id
    and restaurant_id = p_restaurant_id;

  if v_session.id is null then
    raise exception 'Open a table session first.';
  end if;
  if not public.session_is_open(v_session.status) then
    raise exception 'This session is no longer open for orders.';
  end if;
  if not exists (
    select 1
    from public.restaurant_tables t
    where t.id = p_table_id
      and t.restaurant_id = p_restaurant_id
  ) then
    raise exception 'Order source table does not belong to this restaurant';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Add at least one item.';
  end if;

  if exists (select 1 from public.orders o where o.session_id = p_session_id) then
    v_kot_type := 'add_on';
  else
    v_kot_type := 'new';
  end if;

  insert into public.orders (
    restaurant_id,
    session_id,
    waiter_id,
    source_table_id,
    order_number,
    status,
    notes
  )
  values (
    p_restaurant_id,
    p_session_id,
    v_waiter_id,
    p_table_id,
    public.next_order_number(p_restaurant_id),
    'new',
    coalesce(btrim(p_notes), '')
  )
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
    v_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);
    v_name := btrim(coalesce(v_item->>'item_name', ''));
    v_food := nullif(btrim(coalesce(v_item->>'food_type', '')), '');
    if v_food is not null and v_food not in ('veg', 'non_veg') then
      v_food := null;
    end if;
    if v_qty <= 0 or v_name = '' then
      continue;
    end if;
    v_has_item := true;
    insert into public.order_items (
      order_id,
      menu_item_id,
      item_name,
      description,
      food_type,
      unit_price,
      quantity,
      line_total,
      notes,
      sent_to_kitchen
    )
    values (
      v_order.id,
      nullif(v_item->>'menu_item_id', '')::uuid,
      v_name,
      coalesce(btrim(v_item->>'description'), ''),
      v_food,
      v_price,
      v_qty,
      round(v_price * v_qty, 2),
      coalesce(btrim(v_item->>'notes'), ''),
      true
    );
  end loop;

  if not v_has_item then
    raise exception 'Add at least one item.';
  end if;

  insert into public.kots (
    restaurant_id,
    session_id,
    order_id,
    kot_number,
    kot_type,
    status
  )
  values (
    p_restaurant_id,
    p_session_id,
    v_order.id,
    public.next_kot_number(p_restaurant_id),
    v_kot_type,
    'new'
  )
  returning * into v_kot;

  insert into public.kot_items (kot_id, order_item_id, item_name, quantity, notes)
  select v_kot.id, oi.id, oi.item_name, oi.quantity, oi.notes
  from public.order_items oi
  where oi.order_id = v_order.id;

  select jsonb_build_object(
    'id', v_order.id,
    'restaurant_id', v_order.restaurant_id,
    'session_id', v_order.session_id,
    'waiter_id', v_order.waiter_id,
    'source_table_id', v_order.source_table_id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'notes', v_order.notes,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'order_items', coalesce((
      select jsonb_agg(to_jsonb(oi) order by oi.created_at)
      from public.order_items oi
      where oi.order_id = v_order.id
    ), '[]'::jsonb),
    'kots', jsonb_build_array(
      to_jsonb(v_kot) || jsonb_build_object(
        'kot_items', coalesce((
          select jsonb_agg(to_jsonb(ki) order by ki.created_at)
          from public.kot_items ki
          where ki.kot_id = v_kot.id
        ), '[]'::jsonb)
      )
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.submit_waiter_order(uuid, uuid, uuid, jsonb, text) from public;
grant execute on function public.submit_waiter_order(uuid, uuid, uuid, jsonb, text) to authenticated;
