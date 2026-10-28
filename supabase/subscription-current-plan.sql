-- BSB Digital Menu — current subscription source of truth.
-- Additive. Safe to re-run. Run AFTER supabase/subscription-plans.sql.
--
-- Root cause this repairs:
--   Current plan is restaurants.plan_id. Assignment history is append-only
--   and is not current state. Restaurant Subscriptions / Assign drawer /
--   Create Invoice all read platform_restaurants via the Edge Function.
--   Re-running founder-console.sql drops plan_id from that directory RPC, so
--   the UI shows None even when history has YEARLY (or even when plan_id is
--   set). This file:
--     1. Restores plan columns on the directory RPCs.
--     2. Adds platform_list_restaurant_subscriptions() as the founder-auth
--        source used by those three screens (not overwritten by founder-console).
--     3. Fills restaurants.plan_id ONLY where it is currently NULL and the
--        latest assignment row still points at a real plan. Validity, freeze,
--        and block are unchanged. History rows are not deleted or rewritten.
--     4. Invoice create requires restaurants.plan_id and links the matching
--        assignment, never the latest history row of a different plan.

-- ---------------------------------------------------------------------------
-- 1. Restore directory RPCs (idempotent; same signature as subscription-plans.sql)
-- ---------------------------------------------------------------------------
drop function if exists public.platform_restaurants(text, text, int, int);
create function public.platform_restaurants(
  p_search text default '',
  p_status text default '',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  owner_id uuid,
  owner_username text,
  owner_blocked boolean,
  phone text,
  status text,
  plan_id uuid,
  plan_name text,
  plan_price_inr numeric,
  plan_billing_cycle text,
  valid_from timestamptz,
  valid_until timestamptz,
  remaining_days integer,
  table_count bigint,
  menu_item_count bigint,
  waiter_count bigint,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select r.id, r.name, r.slug, r.user_id, r.phone, r.status, r.plan_id,
           r.valid_from, r.valid_until, r.created_at,
           coalesce(p.username, '') as owner_username,
           coalesce(p.is_blocked, false) as owner_blocked,
           public.restaurant_effective_status(r.id) as eff_status
    from public.restaurants r
    left join public.profiles p on p.id = r.user_id
    where (coalesce(p_search, '') = ''
            or r.name ilike '%' || p_search || '%'
            or coalesce(p.username, '') ilike '%' || p_search || '%')
      and (coalesce(p_status, '') = '' or public.restaurant_effective_status(r.id) = p_status)
  )
  select b.id, b.name, b.slug, b.user_id, b.owner_username, b.owner_blocked, b.phone,
    b.eff_status, b.plan_id, coalesce(pl.name, ''), pl.price_inr, pl.billing_cycle,
    b.valid_from, b.valid_until,
    case when b.valid_until is null then null
         else greatest(0, ceil(extract(epoch from (b.valid_until - now())) / 86400))::int end,
    (select count(*) from public.restaurant_tables t where t.restaurant_id = b.id),
    (select count(*) from public.menu_items m where m.restaurant_id = b.id),
    (select count(*) from public.waiters w where w.restaurant_id = b.id),
    b.created_at,
    count(*) over()
  from base b
  left join public.platform_subscription_plans pl on pl.id = b.plan_id
  order by b.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke all on function public.platform_restaurants(text, text, int, int) from public, anon, authenticated;
grant execute on function public.platform_restaurants(text, text, int, int) to service_role;

drop function if exists public.platform_restaurant_detail(uuid);
create function public.platform_restaurant_detail(p_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  phone text,
  address text,
  logo_url text,
  status text,
  plan_id uuid,
  plan_name text,
  plan_price_inr numeric,
  plan_billing_cycle text,
  valid_from timestamptz,
  valid_until timestamptz,
  remaining_days integer,
  created_at timestamptz,
  owner_id uuid,
  owner_username text,
  owner_blocked boolean,
  table_count bigint,
  menu_item_count bigint,
  waiter_count bigint,
  total_orders bigint,
  total_revenue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.name, r.slug, r.phone, r.address, r.logo_url,
    public.restaurant_effective_status(r.id),
    r.plan_id, coalesce(pl.name, ''), pl.price_inr, pl.billing_cycle,
    r.valid_from, r.valid_until,
    case when r.valid_until is null then null
         else greatest(0, ceil(extract(epoch from (r.valid_until - now())) / 86400))::int end,
    r.created_at, r.user_id,
    coalesce(p.username, ''),
    coalesce(p.is_blocked, false),
    (select count(*) from public.restaurant_tables t where t.restaurant_id = r.id),
    (select count(*) from public.menu_items m where m.restaurant_id = r.id),
    (select count(*) from public.waiters w where w.restaurant_id = r.id),
    (select count(*) from public.orders o where o.restaurant_id = r.id),
    (select coalesce(sum(amount), 0) from public.payments pay where pay.restaurant_id = r.id)
  from public.restaurants r
  left join public.profiles p on p.id = r.user_id
  left join public.platform_subscription_plans pl on pl.id = r.plan_id
  where r.id = p_id;
$$;

revoke all on function public.platform_restaurant_detail(uuid) from public, anon, authenticated;
grant execute on function public.platform_restaurant_detail(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Founder-auth current subscription list (source for the three screens)
-- ---------------------------------------------------------------------------
create or replace function public.platform_list_restaurant_subscriptions()
returns table (
  id uuid,
  name text,
  slug text,
  owner_id uuid,
  owner_username text,
  owner_blocked boolean,
  phone text,
  status text,
  plan_id uuid,
  plan_name text,
  plan_price_inr numeric,
  plan_billing_cycle text,
  plan_custom_cycle_days integer,
  latest_assignment_id uuid,
  valid_from timestamptz,
  valid_until timestamptz,
  remaining_days integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.platform_require_admin();
  return query
    select r.id, r.name, r.slug, r.user_id,
           coalesce(p.username, ''),
           coalesce(p.is_blocked, false),
           r.phone,
           public.restaurant_effective_status(r.id),
           r.plan_id,
           coalesce(pl.name, ''),
           pl.price_inr,
           pl.billing_cycle,
           pl.custom_cycle_days,
           latest.id,
           r.valid_from,
           r.valid_until,
           case when r.valid_until is null then null
                else greatest(0, ceil(extract(epoch from (r.valid_until - now())) / 86400))::int end,
           r.created_at
    from public.restaurants r
    left join public.profiles p on p.id = r.user_id
    left join public.platform_subscription_plans pl on pl.id = r.plan_id
    left join lateral (
      select a.id
      from public.platform_subscription_assignments a
      where a.restaurant_id = r.id
        and r.plan_id is not null
        and a.plan_id = r.plan_id
      order by a.created_at desc
      limit 1
    ) latest on true
    order by r.created_at desc;
end;
$$;

revoke all on function public.platform_list_restaurant_subscriptions() from public, anon;
grant execute on function public.platform_list_restaurant_subscriptions() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Assign returns the confirmed current subscription, not just ids
-- ---------------------------------------------------------------------------
create or replace function public.platform_assign_subscription(
  p_restaurant_id uuid,
  p_plan_id uuid,
  p_change_validity boolean default false,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
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
  v_change boolean;
  v_from timestamptz;
  v_until timestamptz;
  v_assignment_id uuid;
begin
  perform public.platform_require_admin();

  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  select * into v_plan from public.platform_subscription_plans where id = p_plan_id;
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  if v_plan.status <> 'active' then
    raise exception 'Only an active plan can be assigned' using errcode = '22023';
  end if;

  v_change := coalesce(p_change_validity, false);
  if v_restaurant.valid_from is null and v_restaurant.valid_until is null then
    v_change := true;
  end if;

  if v_change then
    v_from := p_valid_from;
    v_until := p_valid_until;
    if v_from is null or v_until is null then
      raise exception 'Choose a start date and expiry before changing validity' using errcode = '22023';
    end if;
    if v_until <= v_from then
      raise exception 'Expiry date must be after the start date' using errcode = '22023';
    end if;
  else
    v_from := v_restaurant.valid_from;
    v_until := v_restaurant.valid_until;
  end if;

  if v_restaurant.plan_id is not distinct from p_plan_id and not v_change then
    raise exception 'This restaurant is already on that plan' using errcode = '22023';
  end if;

  update public.restaurants
    set plan_id = p_plan_id,
        valid_from = v_from,
        valid_until = v_until,
        status = case
          when status in ('frozen', 'blocked') then status
          when v_change then 'active'
          else status
        end
    where id = p_restaurant_id;

  insert into public.platform_subscription_assignments (
    restaurant_id, plan_id, previous_plan_id, actor_id, source, note,
    change_validity, valid_from, valid_until, previous_valid_from, previous_valid_until
  ) values (
    p_restaurant_id, p_plan_id, v_restaurant.plan_id, auth.uid(), 'founder', coalesce(p_note, ''),
    v_change, v_from, v_until, v_restaurant.valid_from, v_restaurant.valid_until
  )
  returning id into v_assignment_id;

  perform public.platform_audit(
    case when v_restaurant.plan_id is null then 'subscription_assign' else 'subscription_switch' end,
    p_restaurant_id, null, coalesce(p_note, ''),
    jsonb_build_object(
      'plan_id', p_plan_id,
      'plan_name', v_plan.name,
      'previous_plan_id', v_restaurant.plan_id,
      'change_validity', v_change,
      'valid_from', v_from,
      'valid_until', v_until,
      'previous_valid_from', v_restaurant.valid_from,
      'previous_valid_until', v_restaurant.valid_until,
      'assignment_id', v_assignment_id,
      'status', (select status from public.restaurants where id = p_restaurant_id)
    )
  );

  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'plan_id', p_plan_id,
    'plan_name', v_plan.name,
    'plan_price_inr', v_plan.price_inr,
    'plan_billing_cycle', v_plan.billing_cycle,
    'latest_assignment_id', v_assignment_id,
    'change_validity', v_change,
    'valid_from', v_from,
    'valid_until', v_until
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Invoice create requires current restaurants.plan_id
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
  v_plan_id uuid;
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
  if v_restaurant.plan_id is null then
    raise exception 'Assign a plan before creating an invoice' using errcode = '22023';
  end if;

  v_plan_id := coalesce(p_plan_id, v_restaurant.plan_id);
  if v_plan_id is distinct from v_restaurant.plan_id then
    raise exception 'Invoice plan must match the restaurant current plan' using errcode = '22023';
  end if;

  select * into v_plan from public.platform_subscription_plans where id = v_plan_id;
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;

  if p_assignment_id is not null then
    select * into v_assignment
    from public.platform_subscription_assignments
    where id = p_assignment_id
      and restaurant_id = p_restaurant_id
      and plan_id = v_plan_id;
    if not found then
      raise exception 'Subscription assignment not found' using errcode = 'P0002';
    end if;
  else
    select * into v_assignment
    from public.platform_subscription_assignments
    where restaurant_id = p_restaurant_id
      and plan_id = v_plan_id
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
      'assignment_id', v_assignment.id,
      'amount_inr', v_amount,
      'status', v_status
    )
  );

  return jsonb_build_object(
    'id', v_row.id,
    'invoice_number', v_row.invoice_number,
    'restaurant_id', p_restaurant_id,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'plan_price_inr', v_amount,
    'assignment_id', v_assignment.id,
    'amount_inr', v_row.amount_inr,
    'status', public.platform_subscription_invoice_computed_status(
      v_row.status, v_row.amount_inr, v_row.paid_amount_inr, v_row.due_date
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Safe repair: NULL current plan + existing assignment history
-- ---------------------------------------------------------------------------
-- Copies the latest assignment plan_id onto restaurants.plan_id only when
-- plan_id is currently null. Does not rewrite history, validity, or access.
update public.restaurants r
   set plan_id = latest.plan_id
  from (
    select distinct on (a.restaurant_id)
           a.restaurant_id, a.plan_id
      from public.platform_subscription_assignments a
      join public.platform_subscription_plans p on p.id = a.plan_id
     order by a.restaurant_id, a.created_at desc
  ) latest
 where r.id = latest.restaurant_id
   and r.plan_id is null;
