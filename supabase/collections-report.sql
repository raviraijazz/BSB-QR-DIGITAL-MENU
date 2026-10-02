-- BSB Digital Menu — Phase 13 collections / daily collection report (additive).
-- Read-only reporting on the existing bills, payments, orders, table_sessions,
-- session_tables and waiters tables. Does not modify or delete historical data.
-- Owner-only. Does NOT change waiter auth, KOT/kitchen behavior, or Phase 12 merge/transfer.
--
-- Aggregation is performed server-side so the browser never loads full payment history.
-- Payments carry no void/refund state in the existing schema, so validity is defined as:
--   payment belongs to a bill that is not cancelled (bill-level void) and to this restaurant.
-- Outstanding = payable - paid for open/partially paid bills; never counted as collected.

create or replace function public.get_collections_report(
  p_restaurant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz_offset_minutes integer default 0,
  p_status text default 'all',
  p_method text default null,
  p_waiter_id uuid default null,
  p_table_id uuid default null,
  p_search text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_to timestamptz := coalesce(p_to, now());
  v_status text := lower(coalesce(nullif(btrim(p_status), ''), 'all'));
  v_method text := nullif(lower(btrim(coalesce(p_method, ''))), '');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_tz integer := coalesce(p_tz_offset_minutes, 0);
  v_limit integer := greatest(coalesce(p_limit, 200), 0);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;
  if not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'Not allowed';
  end if;
  if v_status not in ('all', 'settled', 'partial', 'open') then
    v_status := 'all';
  end if;
  if v_method is not null and v_method not in ('cash', 'upi', 'card') then
    v_method := null;
  end if;

  return (
  with session_meta as (
    select
      ts.id as session_id,
      ts.session_number,
      ts.started_at,
      ts.primary_table_id,
      lo.waiter_id,
      w.full_name as waiter_name,
      w.waiter_id as waiter_code
    from public.table_sessions ts
    left join lateral (
      select o.waiter_id
      from public.orders o
      where o.session_id = ts.id
        and o.status <> 'cancelled'
      order by o.created_at desc, o.id desc
      limit 1
    ) lo on true
    left join public.waiters w on w.id = lo.waiter_id
    where ts.restaurant_id = p_restaurant_id
  ),
  session_tables_map as (
    select
      st.session_id,
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'table_number', t.table_number,
          'name', t.name
        )
        order by t.sort_order, t.table_number, t.name
      ) as tables
    from public.session_tables st
    join public.restaurant_tables t on t.id = st.table_id
    join public.table_sessions ts on ts.id = st.session_id and ts.restaurant_id = p_restaurant_id
    group by st.session_id
  ),
  payments_base as (
    select
      p.id,
      p.bill_id,
      p.session_id,
      p.payment_method,
      p.amount,
      p.paid_at,
      ((p.paid_at at time zone 'UTC') + make_interval(mins => v_tz))::date as local_day
    from public.payments p
    join public.bills b on b.id = p.bill_id and b.restaurant_id = p_restaurant_id
    where p.restaurant_id = p_restaurant_id
      and b.status <> 'cancelled'
      and p.paid_at >= v_from
      and p.paid_at < v_to
      and (v_method is null or p.payment_method = v_method)
      and (
        v_status = 'all'
        or (v_status = 'settled' and b.status = 'paid')
        or (v_status = 'partial' and b.status = 'payment_pending')
        or (v_status = 'open' and b.status = 'open')
      )
  ),
  payments_filtered as (
    select pb.*
    from payments_base pb
    join session_meta sm on sm.session_id = pb.session_id
    where (p_waiter_id is null or sm.waiter_id = p_waiter_id)
      and (
        p_table_id is null
        or sm.primary_table_id = p_table_id
        or exists (
          select 1 from public.session_tables st
          where st.session_id = pb.session_id and st.table_id = p_table_id
        )
      )
      and (
        v_search is null
        or sm.session_number ilike '%' || v_search || '%'
        or exists (
          select 1 from public.bills b2
          where b2.id = pb.bill_id and b2.bill_number ilike '%' || v_search || '%'
        )
      )
  ),
  bills_rows as (
    select
      b.id as bill_id,
      b.bill_number,
      b.status,
      b.subtotal,
      b.discount_amount,
      b.grand_total,
      sm.session_id,
      sm.session_number,
      sm.started_at,
      sm.primary_table_id,
      sm.waiter_id,
      sm.waiter_name,
      sm.waiter_code,
      coalesce(
        stm.tables,
        (
          select jsonb_build_array(jsonb_build_object('id', t.id, 'table_number', t.table_number, 'name', t.name))
          from public.restaurant_tables t
          where t.id = sm.primary_table_id
        ),
        '[]'::jsonb
      ) as tables,
      (select max(p.paid_at) from public.payments p where p.bill_id = b.id) as settled_at,
      coalesce((select sum(p.amount) from public.payments p where p.bill_id = b.id), 0) as paid,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'method', p.payment_method,
              'amount', p.amount,
              'paid_at', p.paid_at,
              'reference', p.payment_reference
            )
            order by p.paid_at
          )
          from public.payments p
          where p.bill_id = b.id
        ),
        '[]'::jsonb
      ) as payments
    from public.bills b
    join session_meta sm on sm.session_id = b.session_id
    left join session_tables_map stm on stm.session_id = b.session_id
    where b.restaurant_id = p_restaurant_id
      and b.status <> 'cancelled'
      and (
        v_status = 'all'
        or (v_status = 'settled' and b.status = 'paid')
        or (v_status = 'partial' and b.status = 'payment_pending')
        or (v_status = 'open' and b.status = 'open')
      )
      and exists (select 1 from payments_filtered pf where pf.bill_id = b.id)
  ),
  bills_display as (
    select *
    from bills_rows
    order by settled_at desc nulls last, started_at desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'tz_offset_minutes', v_tz),
    'summary', (
      select jsonb_build_object(
        'total', coalesce(sum(amount), 0),
        'cash', coalesce(sum(amount) filter (where payment_method = 'cash'), 0),
        'upi', coalesce(sum(amount) filter (where payment_method = 'upi'), 0),
        'card', coalesce(sum(amount) filter (where payment_method = 'card'), 0),
        'payment_count', count(*)
      )
      from payments_filtered
    ) || (
      select jsonb_build_object(
        'settled_bills', count(*) filter (where status = 'paid'),
        'bills', count(*),
        'gross', coalesce(sum(subtotal), 0),
        'discount', coalesce(sum(discount_amount), 0),
        'payable', coalesce(sum(grand_total), 0),
        'settled_payable', coalesce(sum(grand_total) filter (where status = 'paid'), 0),
        'settled_collected', coalesce((
          select sum(pf.amount)
          from payments_filtered pf
          join public.bills b on b.id = pf.bill_id
          where b.status = 'paid'
        ), 0)
      )
      from bills_rows
    ) || jsonb_build_object(
      'outstanding', coalesce((
        select sum(greatest(b.grand_total - coalesce((select sum(p.amount) from public.payments p where p.bill_id = b.id), 0), 0))
        from public.bills b
        where b.restaurant_id = p_restaurant_id
          and b.status in ('open', 'payment_pending')
      ), 0)
    ),
    'by_method', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'method', m.method,
          'label', m.label,
          'amount', coalesce(a.amount, 0),
          'count', coalesce(a.cnt, 0)
        )
        order by m.ord
      )
      from (values ('cash', 'Cash', 1), ('upi', 'UPI', 2), ('card', 'Card', 3)) as m(method, label, ord)
      left join (
        select payment_method, sum(amount) as amount, count(*) as cnt
        from payments_filtered
        group by payment_method
      ) a on a.payment_method = m.method
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(
        jsonb_build_object('day', d.local_day, 'amount', d.amount, 'count', d.cnt)
        order by d.local_day
      )
      from (
        select local_day, sum(amount) as amount, count(*) as cnt
        from payments_filtered
        group by local_day
      ) d
    ), '[]'::jsonb),
    'by_hour', coalesce((
      select jsonb_agg(
        jsonb_build_object('hour', h.hour, 'amount', h.amount, 'count', h.cnt)
        order by h.hour
      )
      from (
        select
          extract(hour from ((pf.paid_at at time zone 'UTC') + make_interval(mins => v_tz)))::int as hour,
          sum(pf.amount) as amount,
          count(*) as cnt
        from payments_filtered pf
        group by 1
      ) h
    ), '[]'::jsonb),
    'by_waiter', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'waiter_id', wb.waiter_id,
          'name', w.full_name,
          'waiter_code', w.waiter_id,
          'bills', wb.bills,
          'gross', wb.gross,
          'discount', wb.discount,
          'payable', wb.payable,
          'collected', coalesce(wp.collected, 0)
        )
        order by wb.gross desc
      )
      from (
        select
          sm.waiter_id,
          count(*) as bills,
          coalesce(sum(br.subtotal), 0) as gross,
          coalesce(sum(br.discount_amount), 0) as discount,
          coalesce(sum(br.grand_total), 0) as payable
        from bills_rows br
        join session_meta sm on sm.session_id = br.session_id
        group by sm.waiter_id
      ) wb
      left join (
        select sm.waiter_id, sum(pf.amount) as collected
        from payments_filtered pf
        join session_meta sm on sm.session_id = pf.session_id
        group by sm.waiter_id
      ) wp on wp.waiter_id is not distinct from wb.waiter_id
      left join public.waiters w on w.id = wb.waiter_id
    ), '[]'::jsonb),
    'by_table', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table_id', tb.table_id,
          'table_number', t.table_number,
          'name', t.name,
          'bills', tb.bills,
          'merged_bills', tb.merged_bills,
          'gross', tb.gross,
          'discount', tb.discount,
          'payable', tb.payable,
          'collected', coalesce(tp.collected, 0)
        )
        order by tb.gross desc
      )
      from (
        select
          sm.primary_table_id as table_id,
          count(*) as bills,
          count(*) filter (where coalesce(jsonb_array_length(stm.tables), 0) > 1) as merged_bills,
          coalesce(sum(br.subtotal), 0) as gross,
          coalesce(sum(br.discount_amount), 0) as discount,
          coalesce(sum(br.grand_total), 0) as payable
        from bills_rows br
        join session_meta sm on sm.session_id = br.session_id
        left join session_tables_map stm on stm.session_id = br.session_id
        group by sm.primary_table_id
      ) tb
      left join (
        select sm.primary_table_id as table_id, sum(pf.amount) as collected
        from payments_filtered pf
        join session_meta sm on sm.session_id = pf.session_id
        group by sm.primary_table_id
      ) tp on tp.table_id is not distinct from tb.table_id
      left join public.restaurant_tables t on t.id = tb.table_id
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(row_to_json(bd) order by bd.settled_at desc nulls last)
      from bills_display bd
    ), '[]'::jsonb),
    'bills_total', (select count(*) from bills_rows),
    'outstanding_bills', coalesce((
      select jsonb_agg(row_to_json(o) order by o.started_at)
      from (
        select
          b.id as bill_id,
          b.bill_number,
          b.status,
          b.subtotal,
          b.discount_amount,
          b.grand_total,
          coalesce((select sum(p.amount) from public.payments p where p.bill_id = b.id), 0) as paid,
          greatest(b.grand_total - coalesce((select sum(p.amount) from public.payments p where p.bill_id = b.id), 0), 0) as remaining,
          sm.session_id,
          sm.session_number,
          sm.started_at,
          sm.primary_table_id,
          sm.waiter_id,
          sm.waiter_name,
          sm.waiter_code,
          coalesce(
            stm.tables,
            (
              select jsonb_build_array(jsonb_build_object('id', t.id, 'table_number', t.table_number, 'name', t.name))
              from public.restaurant_tables t
              where t.id = sm.primary_table_id
            ),
            '[]'::jsonb
          ) as tables
        from public.bills b
        join session_meta sm on sm.session_id = b.session_id
        left join session_tables_map stm on stm.session_id = b.session_id
        where b.restaurant_id = p_restaurant_id
          and b.status in ('open', 'payment_pending')
          and (p_waiter_id is null or sm.waiter_id = p_waiter_id)
          and (
            p_table_id is null
            or sm.primary_table_id = p_table_id
            or exists (
              select 1 from public.session_tables st
              where st.session_id = b.session_id and st.table_id = p_table_id
            )
          )
          and (
            v_search is null
            or sm.session_number ilike '%' || v_search || '%'
            or b.bill_number ilike '%' || v_search || '%'
          )
      ) o
     ), '[]'::jsonb)
  )
  );
end;
$$;

revoke all on function public.get_collections_report(uuid, timestamptz, timestamptz, integer, text, text, uuid, uuid, text, integer, integer) from public;
grant execute on function public.get_collections_report(uuid, timestamptz, timestamptz, integer, text, text, uuid, uuid, text, integer, integer) to authenticated;
