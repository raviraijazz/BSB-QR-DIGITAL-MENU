-- BSB Digital Menu — Phase 25: Founder Console platform reports
-- Run AFTER supabase/founder-console.sql and supabase/subscription-plans.sql.
-- subscription-billing.sql is optional; billing cards degrade if those tables
-- are missing. Additive only. Read-only RPCs. Does not mutate restaurants,
-- orders, payments, invoices, or validity.
--
-- Restaurant customer payments live in public.payments.
-- Platform subscription collections live in platform_subscription_invoice_payments.
-- These are never mixed.

-- ---------------------------------------------------------------------------
-- 1. Indexes for report time ranges
-- ---------------------------------------------------------------------------
create index if not exists restaurants_created_at_idx
  on public.restaurants (created_at);

create index if not exists orders_created_at_idx
  on public.orders (created_at);

create index if not exists orders_restaurant_created_at_idx
  on public.orders (restaurant_id, created_at);

create index if not exists platform_subscription_assignments_created_idx
  on public.platform_subscription_assignments (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Bucket helper (UTC calendar)
-- ---------------------------------------------------------------------------
create or replace function public.platform_report_bucket(p_ts timestamptz, p_bucket text)
returns text
language sql
immutable
as $$
  select case
    when p_bucket = 'week' then to_char(date_trunc('week', p_ts at time zone 'utc'), 'YYYY-MM-DD')
    when p_bucket = 'month' then to_char(date_trunc('month', p_ts at time zone 'utc'), 'YYYY-MM')
    else to_char((p_ts at time zone 'utc')::date, 'YYYY-MM-DD')
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Main reports RPC — one round trip of aggregates
-- ---------------------------------------------------------------------------
create or replace function public.platform_reports(
  p_from timestamptz,
  p_to timestamptz,
  p_restaurant_id uuid default null,
  p_status text default '',
  p_plan_id uuid default null,
  p_order_status text default '',
  p_payment_method text default '',
  p_bucket text default 'day',
  p_expiry_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_bucket text;
  v_expiry integer;
  v_kpis jsonb;
  v_status jsonb;
  v_signups jsonb;
  v_orders jsonb;
  v_gmv jsonb;
  v_assignments jsonb;
  v_order_status jsonb;
  v_top jsonb;
  v_plan_mix jsonb;
  v_expiring jsonb;
  v_assignment_rows jsonb;
  v_billing jsonb;
  v_gmv_cash numeric;
  v_gmv_upi numeric;
  v_gmv_card numeric;
  v_gmv_total numeric;
  v_orders_total bigint;
  v_orders_cancelled bigint;
  v_bills bigint;
  v_bill_total numeric;
  v_outstanding numeric;
begin
  perform public.platform_require_admin();

  if p_from is null or p_to is null then
    raise exception 'Choose a start date and end date' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'End date cannot be before the start date' using errcode = '22023';
  end if;

  v_from := p_from;
  v_to := p_to;
  v_bucket := case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end;
  v_expiry := case when p_expiry_days in (7, 30, 90) then p_expiry_days else 30 end;

  with scoped as (
    select r.id, r.name, r.slug, r.created_at, r.plan_id, r.valid_from, r.valid_until,
           public.restaurant_effective_status(r.id) as eff_status
    from public.restaurants r
    where (p_restaurant_id is null or r.id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
  )
  select jsonb_build_object(
      'active', coalesce(count(*) filter (where s.eff_status = 'active'), 0),
      'frozen', coalesce(count(*) filter (where s.eff_status = 'frozen'), 0),
      'blocked', coalesce(count(*) filter (where s.eff_status = 'blocked'), 0),
      'expired', coalesce(count(*) filter (where s.eff_status = 'expired'), 0),
      'other', coalesce(count(*) filter (where s.eff_status not in ('active', 'frozen', 'blocked', 'expired')), 0)
    )
    into v_status
  from scoped s;

  with scoped as (
    select r.id, r.created_at, r.plan_id, r.valid_until,
           public.restaurant_effective_status(r.id) as eff_status
    from public.restaurants r
    where (p_restaurant_id is null or r.id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
  )
  select jsonb_build_object(
      'restaurants_total', count(*),
      'restaurants_created', count(*) filter (where s.created_at >= v_from and s.created_at < v_to),
      'unassigned_plan', count(*) filter (where s.plan_id is null),
      'expiring', jsonb_build_object(
        'd7', count(*) filter (
          where s.eff_status = 'active'
            and s.valid_until is not null
            and s.valid_until >= now()
            and s.valid_until < now() + interval '7 days'
        ),
        'd30', count(*) filter (
          where s.eff_status = 'active'
            and s.valid_until is not null
            and s.valid_until >= now()
            and s.valid_until < now() + interval '30 days'
        ),
        'd90', count(*) filter (
          where s.eff_status = 'active'
            and s.valid_until is not null
            and s.valid_until >= now()
            and s.valid_until < now() + interval '90 days'
        )
      )
    )
    into v_kpis
  from scoped s;

  select
      coalesce(sum(p.amount) filter (where p.payment_method = 'cash'), 0),
      coalesce(sum(p.amount) filter (where p.payment_method = 'upi'), 0),
      coalesce(sum(p.amount) filter (where p.payment_method = 'card'), 0),
      coalesce(sum(p.amount), 0)
    into v_gmv_cash, v_gmv_upi, v_gmv_card, v_gmv_total
  from public.payments p
  join public.bills b on b.id = p.bill_id
  join public.restaurants r on r.id = p.restaurant_id
  where p.paid_at >= v_from and p.paid_at < v_to
    and b.status <> 'cancelled'
    and (p_restaurant_id is null or p.restaurant_id = p_restaurant_id)
    and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
    and (p_plan_id is null or r.plan_id = p_plan_id)
    and (coalesce(p_payment_method, '') = '' or p.payment_method = p_payment_method);

  select
      count(*),
      count(*) filter (where o.status = 'cancelled')
    into v_orders_total, v_orders_cancelled
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.created_at >= v_from and o.created_at < v_to
    and (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
    and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
    and (p_plan_id is null or r.plan_id = p_plan_id)
    and (coalesce(p_order_status, '') = '' or o.status = p_order_status);

  select
      count(*),
      coalesce(sum(b.grand_total), 0)
    into v_bills, v_bill_total
  from public.bills b
  join public.restaurants r on r.id = b.restaurant_id
  where b.created_at >= v_from and b.created_at < v_to
    and b.status <> 'cancelled'
    and (p_restaurant_id is null or b.restaurant_id = p_restaurant_id)
    and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
    and (p_plan_id is null or r.plan_id = p_plan_id);

  select coalesce(sum(greatest(b.grand_total - coalesce((
           select sum(p.amount) from public.payments p where p.bill_id = b.id
         ), 0), 0)), 0)
    into v_outstanding
  from public.bills b
  join public.restaurants r on r.id = b.restaurant_id
  where b.status in ('open', 'payment_pending')
    and (p_restaurant_id is null or b.restaurant_id = p_restaurant_id)
    and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
    and (p_plan_id is null or r.plan_id = p_plan_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', x.bucket, 'label', x.bucket, 'count', x.n
    ) order by x.bucket), '[]'::jsonb)
    into v_signups
  from (
    select public.platform_report_bucket(r.created_at, v_bucket) as bucket, count(*) as n
    from public.restaurants r
    where r.created_at >= v_from and r.created_at < v_to
      and (p_restaurant_id is null or r.id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', x.bucket, 'label', x.bucket, 'count', x.n
    ) order by x.bucket), '[]'::jsonb)
    into v_orders
  from (
    select public.platform_report_bucket(o.created_at, v_bucket) as bucket, count(*) as n
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.created_at >= v_from and o.created_at < v_to
      and o.status <> 'cancelled'
      and (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
      and (coalesce(p_order_status, '') = '' or o.status = p_order_status)
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', x.bucket, 'label', x.bucket, 'amount', x.total, 'count', x.n
    ) order by x.bucket), '[]'::jsonb)
    into v_gmv
  from (
    select public.platform_report_bucket(p.paid_at, v_bucket) as bucket,
           coalesce(sum(p.amount), 0) as total,
           count(*) as n
    from public.payments p
    join public.bills b on b.id = p.bill_id
    join public.restaurants r on r.id = p.restaurant_id
    where p.paid_at >= v_from and p.paid_at < v_to
      and b.status <> 'cancelled'
      and (p_restaurant_id is null or p.restaurant_id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
      and (coalesce(p_payment_method, '') = '' or p.payment_method = p_payment_method)
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', x.bucket, 'label', x.bucket,
      'assignments', x.assignments,
      'renewals', x.renewals
    ) order by x.bucket), '[]'::jsonb)
    into v_assignments
  from (
    select public.platform_report_bucket(a.created_at, v_bucket) as bucket,
           count(*) as assignments,
           count(*) filter (where a.change_validity) as renewals
    from public.platform_subscription_assignments a
    join public.restaurants r on r.id = a.restaurant_id
    where a.created_at >= v_from and a.created_at < v_to
      and (p_restaurant_id is null or a.restaurant_id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or a.plan_id = p_plan_id)
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('status', x.status, 'count', x.n) order by x.status), '[]'::jsonb)
    into v_order_status
  from (
    select o.status, count(*) as n
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.created_at >= v_from and o.created_at < v_to
      and (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
      and (coalesce(p_order_status, '') = '' or o.status = p_order_status)
    group by o.status
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.gmv desc, x.order_count desc), '[]'::jsonb)
    into v_top
  from (
    select r.id, r.name, r.slug, public.restaurant_effective_status(r.id) as status,
           r.plan_id, coalesce(pl.name, '') as plan_name,
           r.created_at, r.valid_until,
           case when r.valid_until is null then null
                else greatest(0, ceil(extract(epoch from (r.valid_until - now())) / 86400))::int end as remaining_days,
           (
             select count(*) from public.orders o
             where o.restaurant_id = r.id
               and o.created_at >= v_from and o.created_at < v_to
               and o.status <> 'cancelled'
               and (coalesce(p_order_status, '') = '' or o.status = p_order_status)
           ) as order_count,
           coalesce((
             select sum(p.amount)
             from public.payments p
             join public.bills b on b.id = p.bill_id
             where p.restaurant_id = r.id
               and p.paid_at >= v_from and p.paid_at < v_to
               and b.status <> 'cancelled'
               and (coalesce(p_payment_method, '') = '' or p.payment_method = p_payment_method)
           ), 0) as gmv,
           coalesce((
             select sum(p.amount) filter (where p.payment_method = 'cash')
             from public.payments p
             join public.bills b on b.id = p.bill_id
             where p.restaurant_id = r.id
               and p.paid_at >= v_from and p.paid_at < v_to
               and b.status <> 'cancelled'
           ), 0) as cash,
           coalesce((
             select sum(p.amount) filter (where p.payment_method = 'upi')
             from public.payments p
             join public.bills b on b.id = p.bill_id
             where p.restaurant_id = r.id
               and p.paid_at >= v_from and p.paid_at < v_to
               and b.status <> 'cancelled'
           ), 0) as upi,
           coalesce((
             select sum(p.amount) filter (where p.payment_method = 'card')
             from public.payments p
             join public.bills b on b.id = p.bill_id
             where p.restaurant_id = r.id
               and p.paid_at >= v_from and p.paid_at < v_to
               and b.status <> 'cancelled'
           ), 0) as card
    from public.restaurants r
    left join public.platform_subscription_plans pl on pl.id = r.plan_id
    where (p_restaurant_id is null or r.id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
    order by gmv desc, order_count desc, r.created_at desc
    limit 50
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.restaurant_count desc), '[]'::jsonb)
    into v_plan_mix
  from (
    select r.plan_id,
           coalesce(pl.name, 'Unassigned') as plan_name,
           count(*) as restaurant_count,
           count(*) filter (where public.restaurant_effective_status(r.id) = 'active') as active_count,
           count(*) filter (where public.restaurant_effective_status(r.id) = 'expired') as expired_count
    from public.restaurants r
    left join public.platform_subscription_plans pl on pl.id = r.plan_id
    where (p_restaurant_id is null or r.id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or r.plan_id = p_plan_id)
    group by r.plan_id, pl.name
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.valid_until), '[]'::jsonb)
    into v_expiring
  from (
    select r.id, r.name, r.slug, public.restaurant_effective_status(r.id) as status,
           coalesce(pl.name, '') as plan_name, r.valid_until,
           greatest(0, ceil(extract(epoch from (r.valid_until - now())) / 86400))::int as remaining_days
    from public.restaurants r
    left join public.platform_subscription_plans pl on pl.id = r.plan_id
    where public.restaurant_effective_status(r.id) = 'active'
      and r.valid_until is not null
      and r.valid_until >= now()
      and r.valid_until < now() + make_interval(days => v_expiry)
      and (p_restaurant_id is null or r.id = p_restaurant_id)
      and (p_plan_id is null or r.plan_id = p_plan_id)
    order by r.valid_until
    limit 100
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into v_assignment_rows
  from (
    select a.id, a.restaurant_id, coalesce(r.name, '') as restaurant_name,
           a.plan_id, coalesce(pl.name, '') as plan_name,
           a.previous_plan_id, a.source, a.change_validity,
           a.valid_from, a.valid_until, a.created_at, a.note
    from public.platform_subscription_assignments a
    join public.restaurants r on r.id = a.restaurant_id
    left join public.platform_subscription_plans pl on pl.id = a.plan_id
    where a.created_at >= v_from and a.created_at < v_to
      and (p_restaurant_id is null or a.restaurant_id = p_restaurant_id)
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
      and (p_plan_id is null or a.plan_id = p_plan_id)
    order by a.created_at desc
    limit 100
  ) x;

  if to_regclass('public.platform_subscription_invoices') is null
     or to_regclass('public.platform_subscription_invoice_payments') is null then
    v_billing := jsonb_build_object(
      'available', false,
      'dependency', 'supabase/subscription-billing.sql'
    );
  else
    v_billing := jsonb_build_object(
      'available', true,
      'collected', (
        select coalesce(sum(case when pay.kind = 'refund' then -pay.amount_inr else pay.amount_inr end), 0)
        from public.platform_subscription_invoice_payments pay
        join public.restaurants r on r.id = pay.restaurant_id
        where pay.payment_date >= (v_from at time zone 'utc')::date
          and pay.payment_date < (v_to at time zone 'utc')::date
          and (p_restaurant_id is null or pay.restaurant_id = p_restaurant_id)
          and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
          and (p_plan_id is null or r.plan_id = p_plan_id)
      ),
      'invoiced', (
        select coalesce(sum(i.amount_inr), 0)
        from public.platform_subscription_invoices i
        join public.restaurants r on r.id = i.restaurant_id
        where i.status <> 'cancelled'
          and i.invoice_date >= (v_from at time zone 'utc')::date
          and i.invoice_date < (v_to at time zone 'utc')::date
          and (p_restaurant_id is null or i.restaurant_id = p_restaurant_id)
          and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
          and (p_plan_id is null or i.plan_id = p_plan_id)
      ),
      'outstanding', (
        select coalesce(sum(greatest(i.amount_inr - i.paid_amount_inr, 0)), 0)
        from public.platform_subscription_invoices i
        join public.restaurants r on r.id = i.restaurant_id
        where i.status <> 'cancelled'
          and (p_restaurant_id is null or i.restaurant_id = p_restaurant_id)
          and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
          and (p_plan_id is null or i.plan_id = p_plan_id)
      ),
      'paid_count', (
        select count(*)
        from public.platform_subscription_invoices i
        join public.restaurants r on r.id = i.restaurant_id
        where i.status <> 'cancelled'
          and (coalesce(i.amount_inr, 0) = 0 or coalesce(i.paid_amount_inr, 0) >= coalesce(i.amount_inr, 0))
          and i.invoice_date >= (v_from at time zone 'utc')::date
          and i.invoice_date < (v_to at time zone 'utc')::date
          and (p_restaurant_id is null or i.restaurant_id = p_restaurant_id)
          and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
          and (p_plan_id is null or i.plan_id = p_plan_id)
      ),
      'partial_count', (
        select count(*)
        from public.platform_subscription_invoices i
        join public.restaurants r on r.id = i.restaurant_id
        where i.status <> 'cancelled'
          and coalesce(i.paid_amount_inr, 0) > 0
          and coalesce(i.paid_amount_inr, 0) < coalesce(i.amount_inr, 0)
          and i.due_date >= (timezone('utc', now()))::date
          and i.invoice_date >= (v_from at time zone 'utc')::date
          and i.invoice_date < (v_to at time zone 'utc')::date
          and (p_restaurant_id is null or i.restaurant_id = p_restaurant_id)
          and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
          and (p_plan_id is null or i.plan_id = p_plan_id)
      ),
      'overdue_count', (
        select count(*)
        from public.platform_subscription_invoices i
        join public.restaurants r on r.id = i.restaurant_id
        where i.status <> 'cancelled'
          and coalesce(i.paid_amount_inr, 0) < coalesce(i.amount_inr, 0)
          and i.due_date < (timezone('utc', now()))::date
          and (p_restaurant_id is null or i.restaurant_id = p_restaurant_id)
          and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
          and (p_plan_id is null or i.plan_id = p_plan_id)
      ),
      'trend', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'bucket', t.bucket, 'label', t.bucket, 'amount', t.total, 'count', t.n
          ) order by t.bucket), '[]'::jsonb)
        from (
          select public.platform_report_bucket((pay.payment_date::timestamp at time zone 'utc'), v_bucket) as bucket,
                 coalesce(sum(case when pay.kind = 'refund' then -pay.amount_inr else pay.amount_inr end), 0) as total,
                 count(*) as n
          from public.platform_subscription_invoice_payments pay
          join public.restaurants r on r.id = pay.restaurant_id
          where pay.payment_date >= (v_from at time zone 'utc')::date
            and pay.payment_date < (v_to at time zone 'utc')::date
            and (p_restaurant_id is null or pay.restaurant_id = p_restaurant_id)
            and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
            and (p_plan_id is null or r.plan_id = p_plan_id)
          group by 1
        ) t
      )
    );
  end if;

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'bucket', v_bucket,
    'kpis', coalesce(v_kpis, '{}'::jsonb) || jsonb_build_object(
      'status', coalesce(v_status, '{}'::jsonb),
      'orders', coalesce(v_orders_total, 0),
      'orders_cancelled', coalesce(v_orders_cancelled, 0),
      'gmv', coalesce(v_gmv_total, 0),
      'gmv_by_method', jsonb_build_object(
        'cash', coalesce(v_gmv_cash, 0),
        'upi', coalesce(v_gmv_upi, 0),
        'card', coalesce(v_gmv_card, 0)
      ),
      'bills', coalesce(v_bills, 0),
      'average_bill', case when coalesce(v_bills, 0) > 0 then round(v_bill_total / v_bills, 2) else null end,
      'outstanding_bills', coalesce(v_outstanding, 0)
    ),
    'series', jsonb_build_object(
      'signups', coalesce(v_signups, '[]'::jsonb),
      'orders', coalesce(v_orders, '[]'::jsonb),
      'gmv', coalesce(v_gmv, '[]'::jsonb),
      'assignments', coalesce(v_assignments, '[]'::jsonb)
    ),
    'orders_by_status', coalesce(v_order_status, '[]'::jsonb),
    'top_restaurants', coalesce(v_top, '[]'::jsonb),
    'plan_mix', coalesce(v_plan_mix, '[]'::jsonb),
    'expiring', coalesce(v_expiring, '[]'::jsonb),
    'assignments', coalesce(v_assignment_rows, '[]'::jsonb),
    'billing', coalesce(v_billing, jsonb_build_object('available', false, 'dependency', 'supabase/subscription-billing.sql'))
  );
end;
$$;

revoke all on function public.platform_reports(timestamptz, timestamptz, uuid, text, uuid, text, text, text, integer)
  from public, anon;
grant execute on function public.platform_reports(timestamptz, timestamptz, uuid, text, uuid, text, text, text, integer)
  to authenticated, service_role;
