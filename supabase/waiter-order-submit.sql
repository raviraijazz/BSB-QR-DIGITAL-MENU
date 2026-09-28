-- BSB Digital Menu — Phase 7 waiter order submit (additive).
-- Replaces submit_waiter_order with restaurant/item/variant checks.
-- Does not drop tables, does not change waiter login or session start.
-- One order = one KOT. Unique indexes prevent duplicate tickets on retry.

create unique index if not exists kots_order_id_key on public.kots (order_id);
create unique index if not exists kot_items_order_item_id_key on public.kot_items (order_item_id);

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
  v_waiter public.waiters;
  v_session public.table_sessions;
  v_order public.orders;
  v_kot public.kots;
  v_item jsonb;
  v_menu public.menu_items;
  v_menu_id uuid;
  v_qty numeric;
  v_price numeric;
  v_name text;
  v_variant text;
  v_food text;
  v_notes text;
  v_has_item boolean := false;
  v_kot_type text;
  v_result jsonb;
  v_variant_row jsonb;
  v_variant_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;

  select *
    into v_waiter
  from public.waiters w
  where w.auth_user_id = auth.uid()
  limit 1;

  if v_waiter.id is null then
    raise exception 'Not allowed';
  end if;
  if v_waiter.is_active is not true then
    raise exception 'This waiter login is disabled. Contact the restaurant owner.';
  end if;
  if v_waiter.restaurant_id is distinct from p_restaurant_id then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1
    from public.waiter_table_assignments a
    where a.waiter_id = v_waiter.id
      and a.table_id = p_table_id
      and a.restaurant_id = p_restaurant_id
  ) then
    raise exception 'You can only order on tables assigned to you.';
  end if;

  select *
    into v_session
  from public.table_sessions ts
  where ts.id = p_session_id
    and ts.restaurant_id = p_restaurant_id;

  if v_session.id is null then
    raise exception 'Open a table session first.';
  end if;
  if not public.session_is_open(v_session.status) then
    raise exception 'This session is no longer open for orders.';
  end if;
  if not (
    v_session.primary_table_id = p_table_id
    or exists (
      select 1 from public.session_tables st
      where st.session_id = v_session.id and st.table_id = p_table_id
    )
  ) then
    raise exception 'You can only order on tables assigned to you.';
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
    v_waiter.id,
    p_table_id,
    public.next_order_number(p_restaurant_id),
    'new',
    coalesce(btrim(p_notes), '')
  )
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
    v_name := btrim(coalesce(v_item->>'item_name', ''));
    v_variant := btrim(coalesce(v_item->>'variant_name', ''));
    v_notes := coalesce(btrim(v_item->>'notes'), '');
    v_food := nullif(btrim(coalesce(v_item->>'food_type', '')), '');
    if v_food is not null and v_food not in ('veg', 'non_veg') then
      v_food := null;
    end if;
    begin
      v_menu_id := nullif(v_item->>'menu_item_id', '')::uuid;
    exception
      when others then
        raise exception 'This item is no longer available.';
    end;
    if v_qty <= 0 then
      continue;
    end if;
    if v_menu_id is null then
      raise exception 'This item is no longer available.';
    end if;

    select *
      into v_menu
    from public.menu_items mi
    where mi.id = v_menu_id
      and mi.restaurant_id = p_restaurant_id;

    if v_menu.id is null then
      raise exception 'This item is no longer available.';
    end if;
    if v_menu.is_available is false then
      raise exception 'This item is no longer available.';
    end if;

    v_price := coalesce(v_menu.price, 0);
    if jsonb_typeof(v_menu.variants) = 'array' and jsonb_array_length(v_menu.variants) > 0 then
      v_variant_ok := false;
      for v_variant_row in select value from jsonb_array_elements(v_menu.variants)
      loop
        if btrim(coalesce(v_variant_row->>'name', '')) = v_variant
           and coalesce((v_variant_row->>'is_available')::boolean, true) is true then
          v_price := coalesce(nullif(v_variant_row->>'price', '')::numeric, v_price);
          v_variant_ok := true;
          exit;
        end if;
      end loop;
      if not v_variant_ok then
        raise exception 'Select a variant.';
      end if;
      v_name := btrim(v_menu.name);
      if v_variant <> '' then
        v_name := v_name || ' (' || v_variant || ')';
      end if;
    else
      v_name := btrim(v_menu.name);
    end if;

    if v_name = '' then
      continue;
    end if;
    if v_food is null then
      v_food := nullif(btrim(coalesce(v_menu.food_type, '')), '');
      if v_food is not null and v_food not in ('veg', 'non_veg') then
        v_food := null;
      end if;
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
      v_menu.id,
      v_name,
      coalesce(btrim(v_menu.description), ''),
      v_food,
      v_price,
      v_qty,
      round(v_price * v_qty, 2),
      v_notes,
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
  on conflict (order_id) do nothing
  returning * into v_kot;

  if v_kot.id is null then
    select * into v_kot from public.kots where order_id = v_order.id;
  end if;

  insert into public.kot_items (kot_id, order_item_id, item_name, quantity, notes)
  select v_kot.id, oi.id, oi.item_name, oi.quantity, oi.notes
  from public.order_items oi
  where oi.order_id = v_order.id
  on conflict (order_item_id) do nothing;

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
