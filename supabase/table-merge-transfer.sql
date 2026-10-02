-- BSB Digital Menu — Phase 12 table merge + transfer (additive).
-- Does not drop or recreate restaurant_tables, table_sessions, session_tables,
-- orders, kots, bills or payments. Owner-only. Waiters may view labels.
-- Historical orders, KOTs, bills and payments stay intact.

create or replace function public.list_session_table_labels(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;
  if public.is_restaurant_owner(p_restaurant_id)
     or public.current_waiter_restaurant_id() is not distinct from p_restaurant_id then
    v_ok := true;
  end if;
  if not v_ok then
    raise exception 'Not allowed';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.session_id)
    from (
      select
        ts.id as session_id,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', t.id,
            'table_number', t.table_number,
            'name', t.name,
            'sort_order', t.sort_order
          ) order by t.sort_order, t.table_number, t.name)
          from public.session_tables st
          join public.restaurant_tables t on t.id = st.table_id
          where st.session_id = ts.id
            and t.restaurant_id = ts.restaurant_id
        ), '[]'::jsonb) as tables
      from public.table_sessions ts
      where ts.restaurant_id = p_restaurant_id
        and public.session_is_open(ts.status)
        and (
          public.is_restaurant_owner(p_restaurant_id)
          or public.waiter_can_access_session(ts.id)
        )
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.merge_table_sessions(
  p_restaurant_id uuid,
  p_primary_table_id uuid,
  p_table_ids uuid[],
  p_confirm_multi boolean default false,
  p_confirm_partial boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_table public.restaurant_tables;
  v_id uuid;
  v_keep public.table_sessions;
  v_donor public.table_sessions;
  v_session public.table_sessions;
  v_keep_id uuid;
  v_session_ids uuid[] := '{}';
  v_bill public.bills;
  v_donor_bill public.bills;
  v_paid numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount_amount numeric(12, 2);
  v_payable numeric(12, 2);
  v_remaining numeric(12, 2);
  v_status text;
  v_has_partial boolean := false;
  v_already boolean := false;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;
  if not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'Only the restaurant owner can merge or transfer tables.';
  end if;

  perform pg_advisory_xact_lock(hashtext('table-move:' || p_restaurant_id::text));

  select array_agg(distinct x)
    into v_ids
  from unnest(coalesce(p_table_ids, '{}'::uuid[]) || p_primary_table_id) as x
  where x is not null;

  if v_ids is null or array_length(v_ids, 1) is null or array_length(v_ids, 1) < 2 then
    raise exception 'Select at least two tables to merge.';
  end if;
  if p_primary_table_id is null or not (p_primary_table_id = any (v_ids)) then
    raise exception 'Choose a primary table.';
  end if;

  foreach v_id in array v_ids loop
    select * into v_table
    from public.restaurant_tables t
    where t.id = v_id;
    if v_table.id is null or v_table.restaurant_id is distinct from p_restaurant_id then
      raise exception 'Tables must belong to this restaurant.';
    end if;
  end loop;

  for v_session in
    select ts.*
    from public.table_sessions ts
    where ts.restaurant_id = p_restaurant_id
      and public.session_is_open(ts.status)
      and (
        ts.primary_table_id = any (v_ids)
        or exists (
          select 1
          from public.session_tables st
          where st.session_id = ts.id
            and st.table_id = any (v_ids)
        )
      )
    order by ts.id
    for update
  loop
    if not (v_session.id = any (v_session_ids)) then
      v_session_ids := v_session_ids || v_session.id;
    end if;
  end loop;

  if v_session_ids is null or array_length(v_session_ids, 1) is null then
    raise exception 'Start a session on the primary table first.';
  end if;

  select ts.*
    into v_keep
  from public.table_sessions ts
  where ts.id = any (v_session_ids)
    and (
      ts.primary_table_id = p_primary_table_id
      or exists (
        select 1 from public.session_tables st
        where st.session_id = ts.id and st.table_id = p_primary_table_id
      )
    )
  order by ts.started_at
  limit 1;

  if v_keep.id is null then
    select ts.*
      into v_keep
    from public.table_sessions ts
    where ts.id = any (v_session_ids)
    order by ts.started_at
    limit 1;
  end if;

  v_keep_id := v_keep.id;

  foreach v_id in array v_session_ids loop
    v_bill := null;
    select * into v_bill
    from public.bills
    where restaurant_id = p_restaurant_id
      and session_id = v_id
    for update;
    if v_bill.id is not null then
      if v_bill.status = 'paid' then
        raise exception 'Cannot merge a settled bill.';
      end if;
      if v_bill.status = 'cancelled' then
        continue;
      end if;
      select coalesce(sum(amount), 0) into v_paid
      from public.payments
      where bill_id = v_bill.id;
      if v_paid > 0 or v_bill.status = 'payment_pending' then
        v_has_partial := true;
      end if;
    end if;
  end loop;

  if v_has_partial and p_confirm_partial is not true then
    raise exception 'This bill has a partial payment. Confirm to continue.';
  end if;

  if array_length(v_session_ids, 1) > 1 and p_confirm_multi is not true then
    raise exception 'These tables have separate sessions. Confirm to combine them into one session and one bill.';
  end if;

  v_bill := null;
  select * into v_bill
  from public.bills
  where restaurant_id = p_restaurant_id
    and session_id = v_keep_id
  order by case when status = 'cancelled' then 1 else 0 end, created_at desc
  limit 1
  for update;

  foreach v_id in array v_session_ids loop
    if v_id = v_keep_id then
      continue;
    end if;

    select * into v_donor
    from public.table_sessions
    where id = v_id
    for update;

    update public.orders
      set session_id = v_keep_id
    where restaurant_id = p_restaurant_id
      and session_id = v_id;

    update public.kots
      set session_id = v_keep_id
    where restaurant_id = p_restaurant_id
      and session_id = v_id;

    v_donor_bill := null;
    select * into v_donor_bill
    from public.bills
    where restaurant_id = p_restaurant_id
      and session_id = v_id
    order by case when status = 'cancelled' then 1 else 0 end, created_at desc
    limit 1
    for update;

    if v_donor_bill.id is not null then
      if v_bill.id is null then
        update public.bills
          set session_id = v_keep_id,
              status = case when v_donor_bill.status = 'cancelled' then 'open' else v_donor_bill.status end
        where id = v_donor_bill.id
          and restaurant_id = p_restaurant_id;
        v_bill := v_donor_bill;
        v_bill.session_id := v_keep_id;
      else
        if v_bill.status = 'cancelled' and v_donor_bill.status <> 'cancelled' then
          update public.bills
            set status = v_donor_bill.status,
                discount_type = v_donor_bill.discount_type,
                discount_value = v_donor_bill.discount_value
          where id = v_bill.id
            and restaurant_id = p_restaurant_id;
          v_bill.status := v_donor_bill.status;
          v_bill.discount_type := v_donor_bill.discount_type;
          v_bill.discount_value := v_donor_bill.discount_value;
        end if;
        update public.payments
          set session_id = v_keep_id,
              bill_id = v_bill.id
        where restaurant_id = p_restaurant_id
          and bill_id = v_donor_bill.id;

        update public.bills
          set status = 'cancelled'
        where id = v_donor_bill.id
          and restaurant_id = p_restaurant_id
          and status <> 'paid';
      end if;
    end if;

    update public.payments
      set session_id = v_keep_id
    where restaurant_id = p_restaurant_id
      and session_id = v_id
      and (v_bill.id is null or bill_id = coalesce(v_bill.id, bill_id));

    update public.table_sessions
      set status = 'closed',
          closed_at = now()
    where id = v_id
      and restaurant_id = p_restaurant_id
      and status not in ('closed', 'cancelled');
  end loop;

  if v_keep.primary_table_id is distinct from p_primary_table_id then
    update public.table_sessions
      set primary_table_id = p_primary_table_id
    where id = v_keep_id
      and restaurant_id = p_restaurant_id;
  end if;

  foreach v_id in array v_ids loop
    insert into public.session_tables (session_id, table_id)
    values (v_keep_id, v_id)
    on conflict (session_id, table_id) do nothing;
  end loop;

  select count(*) into v_count
  from public.session_tables
  where session_id = v_keep_id
    and table_id = any (v_ids);
  if v_count = array_length(v_ids, 1) and array_length(v_session_ids, 1) = 1 then
    v_already := true;
  end if;

  select * into v_bill
  from public.bills
  where restaurant_id = p_restaurant_id
    and session_id = v_keep_id
    and status <> 'cancelled'
  limit 1;

  if v_bill.id is not null then
    select round(coalesce(sum(oi.line_total), 0), 2)
      into v_subtotal
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.session_id = v_keep_id
      and o.restaurant_id = p_restaurant_id
      and o.status <> 'cancelled';

    v_discount_amount := 0;
    if v_bill.discount_type = 'percent' then
      v_discount_amount := round(v_subtotal * least(coalesce(v_bill.discount_value, 0), 100) / 100.0, 2);
    elsif v_bill.discount_type = 'amount' then
      v_discount_amount := round(least(coalesce(v_bill.discount_value, 0), v_subtotal), 2);
    end if;
    v_payable := round(greatest(v_subtotal - v_discount_amount, 0), 2);

    select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where bill_id = v_bill.id;
    if v_paid > v_payable then
      raise exception 'Payments exceed the combined payable. Adjust discounts before merging.';
    end if;

    v_remaining := round(greatest(v_payable - v_paid, 0), 2);
    v_status := v_bill.status;
    if v_paid > 0 and v_status = 'open' then
      v_status := 'payment_pending';
    end if;

    update public.bills
      set subtotal = v_subtotal,
          discount_amount = v_discount_amount,
          taxable_amount = v_payable,
          grand_total = v_payable,
          status = v_status
    where id = v_bill.id
      and restaurant_id = p_restaurant_id;

    select * into v_bill from public.bills where id = v_bill.id;
  end if;

  select * into v_keep from public.table_sessions where id = v_keep_id;

  return jsonb_build_object(
    'session', to_jsonb(v_keep),
    'bill', to_jsonb(v_bill),
    'table_ids', to_jsonb(v_ids),
    'combined', array_length(v_session_ids, 1) > 1,
    'duplicate', v_already,
    'partial', v_has_partial
  );
end;
$$;

create or replace function public.transfer_table_session(
  p_restaurant_id uuid,
  p_from_table_id uuid,
  p_to_table_id uuid,
  p_confirm_partial boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.restaurant_tables;
  v_to public.restaurant_tables;
  v_session public.table_sessions;
  v_other public.table_sessions;
  v_bill public.bills;
  v_paid numeric(12, 2) := 0;
  v_has_partial boolean := false;
  v_already boolean := false;
  v_linked integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;
  if not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'Only the restaurant owner can merge or transfer tables.';
  end if;
  if p_from_table_id is null or p_to_table_id is null then
    raise exception 'Choose a current table and a destination table.';
  end if;
  if p_from_table_id = p_to_table_id then
    raise exception 'Choose a different available table.';
  end if;

  perform pg_advisory_xact_lock(hashtext('table-move:' || p_restaurant_id::text));

  select * into v_from from public.restaurant_tables where id = p_from_table_id;
  select * into v_to from public.restaurant_tables where id = p_to_table_id;

  if v_from.id is null or v_to.id is null
     or v_from.restaurant_id is distinct from p_restaurant_id
     or v_to.restaurant_id is distinct from p_restaurant_id then
    raise exception 'Tables must belong to this restaurant.';
  end if;

  select ts.*
    into v_session
  from public.table_sessions ts
  where ts.restaurant_id = p_restaurant_id
    and public.session_is_open(ts.status)
    and (
      ts.primary_table_id = p_from_table_id
      or exists (
        select 1 from public.session_tables st
        where st.session_id = ts.id and st.table_id = p_from_table_id
      )
    )
  order by ts.started_at
  limit 1
  for update;

  if v_session.id is null then
    raise exception 'No active session on the current table.';
  end if;

  select ts.*
    into v_other
  from public.table_sessions ts
  where ts.restaurant_id = p_restaurant_id
    and public.session_is_open(ts.status)
    and ts.id <> v_session.id
    and (
      ts.primary_table_id = p_to_table_id
      or exists (
        select 1 from public.session_tables st
        where st.session_id = ts.id and st.table_id = p_to_table_id
      )
    )
  limit 1;

  if v_other.id is not null then
    raise exception 'Destination table is occupied.';
  end if;

  if exists (
    select 1 from public.session_tables st
    where st.session_id = v_session.id
      and st.table_id = p_to_table_id
  ) or v_session.primary_table_id = p_to_table_id then
    v_already := true;
  end if;

  select * into v_bill
  from public.bills
  where restaurant_id = p_restaurant_id
    and session_id = v_session.id
  for update;

  if v_bill.status = 'paid' then
    raise exception 'Cannot transfer a settled bill.';
  end if;
  if v_bill.id is not null then
    select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where bill_id = v_bill.id;
    if v_paid > 0 or v_bill.status = 'payment_pending' then
      v_has_partial := true;
    end if;
  end if;
  if v_has_partial and p_confirm_partial is not true then
    raise exception 'This bill has a partial payment. Confirm to continue.';
  end if;

  insert into public.session_tables (session_id, table_id)
  values (v_session.id, p_to_table_id)
  on conflict (session_id, table_id) do nothing;

  update public.table_sessions
    set primary_table_id = p_to_table_id
  where id = v_session.id
    and restaurant_id = p_restaurant_id
    and primary_table_id is distinct from p_to_table_id;

  delete from public.session_tables
  where session_id = v_session.id
    and table_id <> p_to_table_id;

  select count(*) into v_linked
  from public.session_tables
  where session_id = v_session.id;
  if v_linked = 0 then
    insert into public.session_tables (session_id, table_id)
    values (v_session.id, p_to_table_id)
    on conflict (session_id, table_id) do nothing;
  end if;

  select * into v_session from public.table_sessions where id = v_session.id;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'from_table_id', p_from_table_id,
    'to_table_id', p_to_table_id,
    'duplicate', v_already,
    'partial', v_has_partial
  );
end;
$$;

revoke all on function public.list_session_table_labels(uuid) from public;
revoke all on function public.merge_table_sessions(uuid, uuid, uuid[], boolean, boolean) from public;
revoke all on function public.transfer_table_session(uuid, uuid, uuid, boolean) from public;

grant execute on function public.list_session_table_labels(uuid) to authenticated;
grant execute on function public.merge_table_sessions(uuid, uuid, uuid[], boolean, boolean) to authenticated;
grant execute on function public.transfer_table_session(uuid, uuid, uuid, boolean) to authenticated;
