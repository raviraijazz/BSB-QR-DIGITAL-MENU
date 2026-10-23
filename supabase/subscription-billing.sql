-- BSB Digital Menu — Phase 24: Subscription billing, invoices and payment tracking
-- Run AFTER supabase/subscription-plans.sql.
-- Additive only. Does not touch public.payments (restaurant order/bill collections).
-- No sample invoices, prices, tax rates or payment rows are inserted.
-- Invoicing is tax-neutral. Recording a payment does not change restaurant
-- validity unless the founder explicitly confirms payment-plus-renewal.

-- ---------------------------------------------------------------------------
-- 1. Sequence counters (invoice / receipt numbers)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_subscription_number_counters (
  kind text not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (kind, year),
  constraint platform_subscription_number_counters_kind_check
    check (kind in ('invoice', 'receipt')),
  constraint platform_subscription_number_counters_year_check
    check (year between 2000 and 2100),
  constraint platform_subscription_number_counters_value_check
    check (last_value >= 0)
);

alter table public.platform_subscription_number_counters enable row level security;
revoke all on public.platform_subscription_number_counters from public, anon, authenticated;

create or replace function public.platform_next_subscription_number(p_kind text, p_year integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value integer;
begin
  if p_kind not in ('invoice', 'receipt') then
    raise exception 'Unknown number kind' using errcode = '22023';
  end if;
  insert into public.platform_subscription_number_counters (kind, year, last_value)
  values (p_kind, p_year, 1)
  on conflict (kind, year)
    do update set last_value = public.platform_subscription_number_counters.last_value + 1
  returning last_value into v_value;
  return v_value;
end;
$$;

revoke all on function public.platform_next_subscription_number(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invoices (plan price snapshot; independent of restaurant order payments)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  assignment_id uuid references public.platform_subscription_assignments (id),
  plan_id uuid references public.platform_subscription_plans (id),
  plan_name text not null,
  plan_price_inr numeric(12, 2) not null,
  billing_cycle text not null default '',
  custom_cycle_days integer,
  amount_inr numeric(12, 2) not null,
  paid_amount_inr numeric(12, 2) not null default 0,
  invoice_date date not null,
  due_date date not null,
  status text not null default 'pending',
  note text not null default '',
  cancelled_at timestamptz,
  cancelled_reason text not null default '',
  actor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_subscription_invoices_number_not_blank check (btrim(invoice_number) <> ''),
  constraint platform_subscription_invoices_plan_name_check check (btrim(plan_name) <> ''),
  constraint platform_subscription_invoices_amount_check check (amount_inr >= 0),
  constraint platform_subscription_invoices_paid_check
    check (paid_amount_inr >= 0 and paid_amount_inr <= amount_inr),
  constraint platform_subscription_invoices_dates_check check (due_date >= invoice_date),
  constraint platform_subscription_invoices_status_check
    check (status in ('pending', 'partial', 'paid', 'overdue', 'cancelled'))
);

create unique index if not exists platform_subscription_invoices_number_key
  on public.platform_subscription_invoices (invoice_number);

create index if not exists platform_subscription_invoices_restaurant_idx
  on public.platform_subscription_invoices (restaurant_id, invoice_date desc);

create index if not exists platform_subscription_invoices_plan_idx
  on public.platform_subscription_invoices (plan_id, invoice_date desc);

create index if not exists platform_subscription_invoices_status_idx
  on public.platform_subscription_invoices (status, invoice_date desc);

alter table public.platform_subscription_invoices enable row level security;
revoke all on public.platform_subscription_invoices from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Invoice payments / refunds (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_subscription_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.platform_subscription_invoices (id) on delete restrict,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  receipt_number text not null,
  amount_inr numeric(12, 2) not null,
  kind text not null default 'payment',
  payment_date date not null,
  payment_method text not null,
  transaction_reference text not null default '',
  note text not null default '',
  request_id uuid,
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint platform_subscription_invoice_payments_amount_check check (amount_inr > 0),
  constraint platform_subscription_invoice_payments_kind_check
    check (kind in ('payment', 'refund')),
  constraint platform_subscription_invoice_payments_method_check
    check (payment_method in ('cash', 'upi', 'bank_transfer', 'card', 'other'))
);

create unique index if not exists platform_subscription_invoice_payments_receipt_key
  on public.platform_subscription_invoice_payments (receipt_number);

create unique index if not exists platform_subscription_invoice_payments_request_key
  on public.platform_subscription_invoice_payments (invoice_id, request_id)
  where request_id is not null;

create index if not exists platform_subscription_invoice_payments_invoice_idx
  on public.platform_subscription_invoice_payments (invoice_id, created_at desc);

create index if not exists platform_subscription_invoice_payments_date_idx
  on public.platform_subscription_invoice_payments (payment_date desc);

alter table public.platform_subscription_invoice_payments enable row level security;
revoke all on public.platform_subscription_invoice_payments from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.platform_subscription_invoice_computed_status(
  p_status text,
  p_amount numeric,
  p_paid numeric,
  p_due date
)
returns text
language sql
immutable
as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when coalesce(p_amount, 0) = 0 or coalesce(p_paid, 0) >= coalesce(p_amount, 0) then 'paid'
    when p_due < (timezone('utc', now()))::date then 'overdue'
    when coalesce(p_paid, 0) > 0 then 'partial'
    else 'pending'
  end;
$$;

create or replace function public.platform_subscription_invoice_stored_status(
  p_amount numeric,
  p_paid numeric
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_amount, 0) = 0 or coalesce(p_paid, 0) >= coalesce(p_amount, 0) then 'paid'
    when coalesce(p_paid, 0) > 0 then 'partial'
    else 'pending'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Create invoice (price snapshot; never records a payment)
-- ---------------------------------------------------------------------------
create or replace function public.platform_create_subscription_invoice(
  p_restaurant_id uuid,
  p_assignment_id uuid,
  p_plan_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant public.restaurants;
  v_plan public.platform_subscription_plans;
  v_assignment public.platform_subscription_assignments;
  v_year integer;
  v_seq integer;
  v_number text;
  v_amount numeric(12, 2);
  v_status text;
  v_row public.platform_subscription_invoices;
begin
  perform public.platform_require_admin();

  if p_invoice_date is null then
    raise exception 'Invoice date is required' using errcode = '22023';
  end if;
  if p_due_date is null then
    raise exception 'Due date is required' using errcode = '22023';
  end if;
  if p_due_date < p_invoice_date then
    raise exception 'Due date cannot be before the invoice date' using errcode = '22023';
  end if;

  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;
  if v_restaurant.plan_id is null and p_plan_id is null then
    raise exception 'Assign a plan before creating an invoice' using errcode = '22023';
  end if;

  select * into v_plan
  from public.platform_subscription_plans
  where id = coalesce(p_plan_id, v_restaurant.plan_id);
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;

  if p_assignment_id is not null then
    select * into v_assignment
    from public.platform_subscription_assignments
    where id = p_assignment_id and restaurant_id = p_restaurant_id;
    if not found then
      raise exception 'Subscription assignment not found' using errcode = 'P0002';
    end if;
  else
    select * into v_assignment
    from public.platform_subscription_assignments
    where restaurant_id = p_restaurant_id
    order by created_at desc
    limit 1;
  end if;

  v_amount := v_plan.price_inr;
  v_status := public.platform_subscription_invoice_stored_status(v_amount, 0);
  v_year := extract(year from timezone('utc', now()))::int;
  v_seq := public.platform_next_subscription_number('invoice', v_year);
  v_number := 'BSB-SUB-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');

  insert into public.platform_subscription_invoices (
    invoice_number, restaurant_id, assignment_id, plan_id, plan_name, plan_price_inr,
    billing_cycle, custom_cycle_days, amount_inr, paid_amount_inr, invoice_date, due_date,
    status, note, actor_id
  ) values (
    v_number, p_restaurant_id, v_assignment.id, v_plan.id, v_plan.name, v_amount,
    coalesce(v_plan.billing_cycle, ''), v_plan.custom_cycle_days, v_amount, 0,
    p_invoice_date, p_due_date, v_status, coalesce(p_note, ''), auth.uid()
  )
  returning * into v_row;

  perform public.platform_audit(
    'subscription_invoice_create', p_restaurant_id, null, coalesce(p_note, ''),
    jsonb_build_object(
      'invoice_id', v_row.id,
      'invoice_number', v_row.invoice_number,
      'plan_id', v_plan.id,
      'plan_name', v_plan.name,
      'amount_inr', v_amount,
      'status', v_status
    )
  );

  return jsonb_build_object(
    'id', v_row.id,
    'invoice_number', v_row.invoice_number,
    'amount_inr', v_row.amount_inr,
    'status', public.platform_subscription_invoice_computed_status(
      v_row.status, v_row.amount_inr, v_row.paid_amount_inr, v_row.due_date
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Record payment or refund (optional explicit renewal)
-- ---------------------------------------------------------------------------
create or replace function public.platform_record_subscription_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text default '',
  p_note text default '',
  p_request_id uuid default null,
  p_renew boolean default false,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
  p_kind text default 'payment'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.platform_subscription_invoices;
  v_existing public.platform_subscription_invoice_payments;
  v_payment public.platform_subscription_invoice_payments;
  v_restaurant public.restaurants;
  v_amount numeric(12, 2);
  v_paid numeric(12, 2);
  v_year integer;
  v_seq integer;
  v_receipt text;
  v_kind text;
  v_method text;
begin
  perform public.platform_require_admin();

  v_kind := coalesce(nullif(btrim(p_kind), ''), 'payment');
  if v_kind not in ('payment', 'refund') then
    raise exception 'Unknown payment kind' using errcode = '22023';
  end if;
  v_method := coalesce(p_method, '');
  if v_method not in ('cash', 'upi', 'bank_transfer', 'card', 'other') then
    raise exception 'Select a payment method' using errcode = '22023';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required' using errcode = '22023';
  end if;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'Enter a payment amount greater than 0' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.platform_subscription_invoices
  where id = p_invoice_id
  for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'This invoice is cancelled' using errcode = '22023';
  end if;

  if p_request_id is not null then
    select * into v_existing
    from public.platform_subscription_invoice_payments
    where invoice_id = p_invoice_id and request_id = p_request_id;
    if found then
      return jsonb_build_object(
        'id', v_existing.id,
        'receipt_number', v_existing.receipt_number,
        'duplicate', true,
        'invoice_id', v_invoice.id,
        'paid_amount_inr', v_invoice.paid_amount_inr,
        'status', public.platform_subscription_invoice_computed_status(
          v_invoice.status, v_invoice.amount_inr, v_invoice.paid_amount_inr, v_invoice.due_date
        )
      );
    end if;
  end if;

  if v_kind = 'payment' then
    if v_invoice.paid_amount_inr >= v_invoice.amount_inr and v_invoice.amount_inr > 0 then
      raise exception 'This invoice is already paid' using errcode = '22023';
    end if;
    if v_invoice.paid_amount_inr + v_amount > v_invoice.amount_inr then
      raise exception 'Payment cannot exceed the outstanding balance' using errcode = '22023';
    end if;
    v_paid := v_invoice.paid_amount_inr + v_amount;
  else
    if v_amount > v_invoice.paid_amount_inr then
      raise exception 'Refund cannot exceed the amount already paid' using errcode = '22023';
    end if;
    v_paid := v_invoice.paid_amount_inr - v_amount;
  end if;

  if coalesce(p_renew, false) then
    if v_kind <> 'payment' then
      raise exception 'Renewal is only available when recording a payment' using errcode = '22023';
    end if;
    if p_valid_from is null or p_valid_until is null then
      raise exception 'Choose a start date and expiry before renewing' using errcode = '22023';
    end if;
    if p_valid_until <= p_valid_from then
      raise exception 'Expiry date must be after the start date' using errcode = '22023';
    end if;
  end if;

  v_year := extract(year from timezone('utc', now()))::int;
  v_seq := public.platform_next_subscription_number('receipt', v_year);
  v_receipt := 'BSB-RCP-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');

  insert into public.platform_subscription_invoice_payments (
    invoice_id, restaurant_id, receipt_number, amount_inr, kind, payment_date,
    payment_method, transaction_reference, note, request_id, actor_id
  ) values (
    v_invoice.id, v_invoice.restaurant_id, v_receipt, v_amount, v_kind, p_payment_date,
    v_method, coalesce(p_reference, ''), coalesce(p_note, ''), p_request_id, auth.uid()
  )
  returning * into v_payment;

  update public.platform_subscription_invoices
    set paid_amount_inr = v_paid,
        status = public.platform_subscription_invoice_stored_status(amount_inr, v_paid),
        updated_at = now()
    where id = v_invoice.id
    returning * into v_invoice;

  if coalesce(p_renew, false) then
    select * into v_restaurant from public.restaurants where id = v_invoice.restaurant_id for update;
    update public.restaurants
      set valid_from = p_valid_from,
          valid_until = p_valid_until,
          status = case when status in ('frozen', 'blocked') then status else 'active' end
      where id = v_invoice.restaurant_id;
    insert into public.platform_subscription_assignments (
      restaurant_id, plan_id, previous_plan_id, actor_id, source, note,
      change_validity, valid_from, valid_until, previous_valid_from, previous_valid_until
    ) values (
      v_invoice.restaurant_id, coalesce(v_invoice.plan_id, v_restaurant.plan_id), v_restaurant.plan_id,
      auth.uid(), 'founder', coalesce(p_note, 'Payment recorded with explicit renewal'),
      true, p_valid_from, p_valid_until, v_restaurant.valid_from, v_restaurant.valid_until
    );
  end if;

  perform public.platform_audit(
    case
      when v_kind = 'refund' then 'subscription_invoice_refund'
      when coalesce(p_renew, false) then 'subscription_payment_renew'
      else 'subscription_payment_record'
    end,
    v_invoice.restaurant_id, null, coalesce(p_note, ''),
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'payment_id', v_payment.id,
      'receipt_number', v_receipt,
      'amount_inr', v_amount,
      'kind', v_kind,
      'method', v_method,
      'renew', coalesce(p_renew, false),
      'valid_from', p_valid_from,
      'valid_until', p_valid_until,
      'status', public.platform_subscription_invoice_computed_status(
        v_invoice.status, v_invoice.amount_inr, v_invoice.paid_amount_inr, v_invoice.due_date
      )
    )
  );

  return jsonb_build_object(
    'id', v_payment.id,
    'receipt_number', v_receipt,
    'duplicate', false,
    'invoice_id', v_invoice.id,
    'paid_amount_inr', v_invoice.paid_amount_inr,
    'balance_inr', greatest(v_invoice.amount_inr - v_invoice.paid_amount_inr, 0),
    'status', public.platform_subscription_invoice_computed_status(
      v_invoice.status, v_invoice.amount_inr, v_invoice.paid_amount_inr, v_invoice.due_date
    ),
    'renewed', coalesce(p_renew, false)
  );
end;
$$;

create or replace function public.platform_cancel_subscription_invoice(
  p_invoice_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.platform_subscription_invoices;
begin
  perform public.platform_require_admin();
  select * into v_invoice from public.platform_subscription_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'This invoice is already cancelled' using errcode = '22023';
  end if;
  if v_invoice.paid_amount_inr > 0 then
    raise exception 'Refund recorded payments before cancelling this invoice' using errcode = '22023';
  end if;

  update public.platform_subscription_invoices
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_reason = coalesce(p_reason, ''),
        updated_at = now()
    where id = p_invoice_id
    returning * into v_invoice;

  perform public.platform_audit(
    'subscription_invoice_cancel', v_invoice.restaurant_id, null, coalesce(p_reason, ''),
    jsonb_build_object('invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number)
  );

  return jsonb_build_object('id', v_invoice.id, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. List / detail / summary
-- ---------------------------------------------------------------------------
create or replace function public.platform_list_subscription_invoices(
  p_search text default '',
  p_plan_id uuid default null,
  p_status text default '',
  p_method text default '',
  p_from date default null,
  p_to date default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  invoice_number text,
  restaurant_id uuid,
  restaurant_name text,
  plan_id uuid,
  plan_name text,
  plan_price_inr numeric,
  billing_cycle text,
  amount_inr numeric,
  paid_amount_inr numeric,
  balance_inr numeric,
  invoice_date date,
  due_date date,
  status text,
  payment_method text,
  note text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.platform_require_admin();
  return query
  with rows as (
    select i.id, i.invoice_number, i.restaurant_id, coalesce(r.name, '') as restaurant_name,
           i.plan_id, i.plan_name, i.plan_price_inr, i.billing_cycle,
           i.amount_inr, i.paid_amount_inr,
           greatest(i.amount_inr - i.paid_amount_inr, 0) as balance_inr,
           i.invoice_date, i.due_date,
           public.platform_subscription_invoice_computed_status(i.status, i.amount_inr, i.paid_amount_inr, i.due_date) as eff_status,
           (
             select p.payment_method
             from public.platform_subscription_invoice_payments p
             where p.invoice_id = i.id
             order by p.created_at desc
             limit 1
           ) as payment_method,
           i.note, i.created_at
    from public.platform_subscription_invoices i
    left join public.restaurants r on r.id = i.restaurant_id
    where (coalesce(p_search, '') = ''
            or i.invoice_number ilike '%' || p_search || '%'
            or coalesce(r.name, '') ilike '%' || p_search || '%')
      and (p_plan_id is null or i.plan_id = p_plan_id)
      and (p_from is null or i.invoice_date >= p_from)
      and (p_to is null or i.invoice_date <= p_to)
      and (coalesce(p_method, '') = ''
            or exists (
              select 1 from public.platform_subscription_invoice_payments pay
              where pay.invoice_id = i.id and pay.payment_method = p_method
            ))
  )
  select b.id, b.invoice_number, b.restaurant_id, b.restaurant_name, b.plan_id, b.plan_name,
         b.plan_price_inr, b.billing_cycle, b.amount_inr, b.paid_amount_inr, b.balance_inr,
         b.invoice_date, b.due_date, b.eff_status, b.payment_method, b.note, b.created_at,
         count(*) over()
  from rows b
  where coalesce(p_status, '') = '' or b.eff_status = p_status
  order by b.invoice_date desc, b.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.platform_subscription_invoice_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invoice public.platform_subscription_invoices;
  v_name text;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_payments jsonb;
begin
  perform public.platform_require_admin();
  select * into v_invoice from public.platform_subscription_invoices where id = p_id;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  select name, valid_from, valid_until
    into v_name, v_valid_from, v_valid_until
  from public.restaurants where id = v_invoice.restaurant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'receipt_number', p.receipt_number,
      'amount_inr', p.amount_inr,
      'kind', p.kind,
      'payment_date', p.payment_date,
      'payment_method', p.payment_method,
      'transaction_reference', p.transaction_reference,
      'note', p.note,
      'created_at', p.created_at
    ) order by p.created_at desc), '[]'::jsonb)
    into v_payments
  from public.platform_subscription_invoice_payments p
  where p.invoice_id = v_invoice.id;

  return jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'restaurant_id', v_invoice.restaurant_id,
      'restaurant_name', coalesce(v_name, ''),
      'assignment_id', v_invoice.assignment_id,
      'plan_id', v_invoice.plan_id,
      'plan_name', v_invoice.plan_name,
      'plan_price_inr', v_invoice.plan_price_inr,
      'billing_cycle', v_invoice.billing_cycle,
      'custom_cycle_days', v_invoice.custom_cycle_days,
      'amount_inr', v_invoice.amount_inr,
      'paid_amount_inr', v_invoice.paid_amount_inr,
      'balance_inr', greatest(v_invoice.amount_inr - v_invoice.paid_amount_inr, 0),
      'invoice_date', v_invoice.invoice_date,
      'due_date', v_invoice.due_date,
      'status', public.platform_subscription_invoice_computed_status(
        v_invoice.status, v_invoice.amount_inr, v_invoice.paid_amount_inr, v_invoice.due_date
      ),
      'note', v_invoice.note,
      'cancelled_reason', v_invoice.cancelled_reason,
      'valid_from', v_valid_from,
      'valid_until', v_valid_until,
      'created_at', v_invoice.created_at
    ),
    'payments', v_payments
  );
end;
$$;

create or replace function public.platform_subscription_billing_summary(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_collected numeric(12, 2);
  v_paid bigint;
  v_partial bigint;
  v_overdue bigint;
  v_outstanding numeric(12, 2);
begin
  perform public.platform_require_admin();

  select coalesce(sum(case when p.kind = 'refund' then -p.amount_inr else p.amount_inr end), 0)
    into v_collected
  from public.platform_subscription_invoice_payments p
  where (p_from is null or p.payment_date >= p_from)
    and (p_to is null or p.payment_date <= p_to);

  select
      coalesce(sum(case when s.eff = 'paid' then 1 else 0 end), 0),
      coalesce(sum(case when s.eff = 'partial' then 1 else 0 end), 0),
      coalesce(sum(case when s.eff = 'overdue' then 1 else 0 end), 0),
      coalesce(sum(case when s.eff in ('cancelled') then 0 else s.balance end), 0)
    into v_paid, v_partial, v_overdue, v_outstanding
  from (
    select public.platform_subscription_invoice_computed_status(i.status, i.amount_inr, i.paid_amount_inr, i.due_date) as eff,
           greatest(i.amount_inr - i.paid_amount_inr, 0) as balance
    from public.platform_subscription_invoices i
    where (p_from is null or i.invoice_date >= p_from)
      and (p_to is null or i.invoice_date <= p_to)
  ) s;

  return jsonb_build_object(
    'collected', v_collected,
    'paid_count', v_paid,
    'partial_count', v_partial,
    'overdue_count', v_overdue,
    'outstanding', v_outstanding
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants — founder RPCs self-authorize via platform_require_admin()
-- ---------------------------------------------------------------------------
revoke all on function public.platform_create_subscription_invoice(uuid, uuid, uuid, date, date, text) from public, anon;
revoke all on function public.platform_record_subscription_payment(uuid, numeric, date, text, text, text, uuid, boolean, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.platform_cancel_subscription_invoice(uuid, text) from public, anon;
revoke all on function public.platform_list_subscription_invoices(text, uuid, text, text, date, date, int, int) from public, anon;
revoke all on function public.platform_subscription_invoice_detail(uuid) from public, anon;
revoke all on function public.platform_subscription_billing_summary(date, date) from public, anon;

grant execute on function public.platform_create_subscription_invoice(uuid, uuid, uuid, date, date, text) to authenticated;
grant execute on function public.platform_record_subscription_payment(uuid, numeric, date, text, text, text, uuid, boolean, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.platform_cancel_subscription_invoice(uuid, text) to authenticated;
grant execute on function public.platform_list_subscription_invoices(text, uuid, text, text, date, date, int, int) to authenticated;
grant execute on function public.platform_subscription_invoice_detail(uuid) to authenticated;
grant execute on function public.platform_subscription_billing_summary(date, date) to authenticated;
