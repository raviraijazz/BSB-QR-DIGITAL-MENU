-- BSB Digital Menu — Phase 23: Subscription & Plans
-- Run AFTER supabase/founder-console.sql (and founder-password-gate.sql).
-- Additive only: no restaurants, menus, payments or existing validity rows
-- are deleted. No sample plans are inserted.
--
-- Founder-managed catalog + restaurant assignment + optional auto-assign
-- for NEW restaurant inserts. Access expiry still uses restaurants.valid_from
-- / valid_until and restaurant_effective_status(). Frozen/blocked stay
-- independent of plan changes.

-- ---------------------------------------------------------------------------
-- 1. Plan catalog
-- ---------------------------------------------------------------------------
create table if not exists public.platform_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_inr numeric(12, 2) not null,
  billing_cycle text not null,
  custom_cycle_days integer,
  features jsonb not null default '[]'::jsonb,
  max_waiters integer,
  default_duration_days integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_subscription_plans_name_not_blank check (btrim(name) <> ''),
  constraint platform_subscription_plans_price_check check (price_inr >= 0),
  constraint platform_subscription_plans_cycle_check
    check (billing_cycle in ('monthly', 'yearly', 'custom')),
  constraint platform_subscription_plans_custom_days_check
    check (
      (billing_cycle <> 'custom' and custom_cycle_days is null)
      or (billing_cycle = 'custom' and custom_cycle_days between 1 and 3650)
    ),
  constraint platform_subscription_plans_features_check
    check (jsonb_typeof(features) = 'array'),
  constraint platform_subscription_plans_waiters_check
    check (max_waiters is null or max_waiters >= 1),
  constraint platform_subscription_plans_default_duration_check
    check (default_duration_days is null or default_duration_days between 1 and 3650),
  constraint platform_subscription_plans_status_check
    check (status in ('active', 'inactive', 'archived'))
);

alter table public.platform_subscription_plans
  add column if not exists default_duration_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_subscription_plans_default_duration_check'
  ) then
    alter table public.platform_subscription_plans
      add constraint platform_subscription_plans_default_duration_check
      check (default_duration_days is null or default_duration_days between 1 and 3650);
  end if;
end $$;

create unique index if not exists platform_subscription_plans_name_key
  on public.platform_subscription_plans (lower(btrim(name)))
  where status <> 'archived';

create index if not exists platform_subscription_plans_status_idx
  on public.platform_subscription_plans (status, created_at desc);

alter table public.platform_subscription_plans enable row level security;
revoke all on public.platform_subscription_plans from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Current plan on the restaurant (validity dates stay on restaurants)
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists plan_id uuid references public.platform_subscription_plans (id);

create index if not exists restaurants_plan_id_idx on public.restaurants (plan_id);

-- ---------------------------------------------------------------------------
-- 3. Assignment history (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_subscription_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  plan_id uuid not null references public.platform_subscription_plans (id),
  previous_plan_id uuid references public.platform_subscription_plans (id),
  actor_id uuid,
  source text not null default 'founder',
  note text not null default '',
  change_validity boolean not null default false,
  valid_from timestamptz,
  valid_until timestamptz,
  previous_valid_from timestamptz,
  previous_valid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint platform_subscription_assignments_source_check
    check (source in ('founder', 'registration'))
);

create index if not exists platform_subscription_assignments_restaurant_idx
  on public.platform_subscription_assignments (restaurant_id, created_at desc);

alter table public.platform_subscription_assignments enable row level security;
revoke all on public.platform_subscription_assignments from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Singleton default-plan settings (future registrations only)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_subscription_settings (
  id integer primary key default 1 check (id = 1),
  default_plan_id uuid references public.platform_subscription_plans (id),
  default_duration_days integer not null default 365,
  auto_assign_enabled boolean not null default false,
  last_assign_error text not null default '',
  updated_at timestamptz not null default now(),
  constraint platform_subscription_settings_days_check
    check (default_duration_days between 1 and 3650)
);

insert into public.platform_subscription_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.platform_subscription_settings enable row level security;
revoke all on public.platform_subscription_settings from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Validity change must not clear an independent freeze/block
-- ---------------------------------------------------------------------------
create or replace function public.platform_manage_restaurant(
  p_restaurant_id uuid,
  p_action text,
  p_days integer default null,
  p_reason text default ''
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.restaurants;
  v_days integer;
begin
  perform public.platform_require_admin();

  if p_action not in ('freeze', 'unfreeze', 'block', 'unblock', 'set_validity', 'renew') then
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  if p_action in ('set_validity', 'renew') then
    v_days := coalesce(p_days, 0);
    if v_days <= 0 or v_days > 3650 then
      raise exception 'Validity duration must be between 1 and 3650 days' using errcode = '22023';
    end if;
  end if;

  update public.restaurants r
    set status = case p_action
        when 'freeze' then 'frozen'
        when 'block' then 'blocked'
        when 'unfreeze' then 'active'
        when 'unblock' then 'active'
        when 'set_validity' then case when r.status in ('frozen', 'blocked') then r.status else 'active' end
        when 'renew' then case when r.status in ('frozen', 'blocked') then r.status else 'active' end
        else r.status
      end,
      valid_from = case when p_action = 'set_validity' then now() else r.valid_from end,
      valid_until = case
        when p_action = 'set_validity' then now() + (v_days || ' days')::interval
        when p_action = 'renew' then
          greatest(coalesce(r.valid_until, now()), now()) + (v_days || ' days')::interval
        else r.valid_until
      end
    where r.id = p_restaurant_id
    returning * into v_row;

  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  if p_action in ('freeze', 'block') then
    update public.platform_support_sessions
      set status = 'ended', ended_at = now(), end_reason = 'restaurant ' || p_action
      where restaurant_id = p_restaurant_id and status = 'active';
  end if;

  perform public.platform_audit(
    'restaurant_' || p_action, p_restaurant_id, null, coalesce(p_reason, ''),
    jsonb_build_object('days', v_days, 'status', v_row.status, 'valid_until', v_row.valid_until)
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Plan catalog RPCs
-- ---------------------------------------------------------------------------
create or replace function public.platform_list_plans(p_include_archived boolean default false)
returns setof public.platform_subscription_plans
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.platform_require_admin();
  return query
    select *
    from public.platform_subscription_plans
    where p_include_archived or status <> 'archived'
    order by created_at asc;
end;
$$;

drop function if exists public.platform_upsert_plan(uuid, text, text, numeric, text, integer, jsonb, integer, text);
drop function if exists public.platform_upsert_plan(uuid, text, text, numeric, text, integer, jsonb, integer, text, integer);
create or replace function public.platform_upsert_plan(
  p_id uuid,
  p_name text,
  p_description text,
  p_price_inr numeric,
  p_billing_cycle text,
  p_custom_cycle_days integer,
  p_features jsonb,
  p_max_waiters integer,
  p_status text,
  p_default_duration_days integer default null
)
returns public.platform_subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_subscription_plans;
  v_name text;
  v_cycle text;
  v_status text;
  v_days integer;
  v_waiters integer;
  v_features jsonb;
  v_default_days integer;
begin
  perform public.platform_require_admin();

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Plan name is required' using errcode = '22023';
  end if;
  if p_price_inr is null or p_price_inr < 0 then
    raise exception 'Enter a valid price in INR' using errcode = '22023';
  end if;

  v_cycle := coalesce(p_billing_cycle, '');
  if v_cycle not in ('monthly', 'yearly', 'custom') then
    raise exception 'Select a billing cycle' using errcode = '22023';
  end if;
  v_days := p_custom_cycle_days;
  if v_cycle = 'custom' then
    if v_days is null or v_days < 1 or v_days > 3650 then
      raise exception 'Custom cycle must be between 1 and 3650 days' using errcode = '22023';
    end if;
  else
    v_days := null;
  end if;

  v_status := coalesce(nullif(btrim(p_status), ''), 'active');
  if v_status not in ('active', 'inactive') then
    raise exception 'Select active or inactive' using errcode = '22023';
  end if;

  v_waiters := p_max_waiters;
  if v_waiters is not null and v_waiters < 1 then
    raise exception 'Waiter limit must be a whole number of 1 or more' using errcode = '22023';
  end if;

  v_default_days := p_default_duration_days;
  if v_default_days is not null and (v_default_days < 1 or v_default_days > 3650) then
    raise exception 'Default validity must be between 1 and 3650 days' using errcode = '22023';
  end if;

  v_features := coalesce(p_features, '[]'::jsonb);
  if jsonb_typeof(v_features) <> 'array' then
    v_features := '[]'::jsonb;
  end if;

  if p_id is null then
    insert into public.platform_subscription_plans
      (name, description, price_inr, billing_cycle, custom_cycle_days, features, max_waiters, default_duration_days, status)
    values
      (v_name, coalesce(p_description, ''), p_price_inr, v_cycle, v_days, v_features, v_waiters, v_default_days, v_status)
    returning * into v_row;
  else
    update public.platform_subscription_plans
      set name = v_name,
          description = coalesce(p_description, ''),
          price_inr = p_price_inr,
          billing_cycle = v_cycle,
          custom_cycle_days = v_days,
          features = v_features,
          max_waiters = v_waiters,
          default_duration_days = v_default_days,
          status = case when status = 'archived' then status else v_status end,
          updated_at = now()
      where id = p_id
      returning * into v_row;
    if not found then
      raise exception 'Plan not found' using errcode = 'P0002';
    end if;
  end if;

  perform public.platform_audit(
    case when p_id is null then 'plan_create' else 'plan_update' end,
    null, null, '',
    jsonb_build_object('plan_id', v_row.id, 'name', v_row.name, 'price_inr', v_row.price_inr, 'status', v_row.status)
  );
  return v_row;
end;
$$;

create or replace function public.platform_set_plan_status(p_id uuid, p_status text)
returns public.platform_subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_subscription_plans;
  v_status text;
  v_assigned int;
begin
  perform public.platform_require_admin();
  v_status := coalesce(p_status, '');
  if v_status not in ('active', 'inactive', 'archived') then
    raise exception 'Unknown plan status' using errcode = '22023';
  end if;

  if v_status = 'archived' then
    select count(*) into v_assigned from public.restaurants where plan_id = p_id;
    if v_assigned > 0 then
      raise exception 'This plan is assigned to % restaurant(s). Deactivate it instead of archiving.', v_assigned
        using errcode = '23503';
    end if;
  end if;

  update public.platform_subscription_plans
    set status = v_status,
        updated_at = now()
    where id = p_id
    returning * into v_row;
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;

  if v_status <> 'active' then
    update public.platform_subscription_settings
      set auto_assign_enabled = false,
          last_assign_error = case
            when default_plan_id = p_id then 'Default plan is no longer active. Automatic assignment was turned off.'
            else last_assign_error
          end,
          updated_at = now()
      where id = 1 and default_plan_id = p_id and auto_assign_enabled;
  end if;

  perform public.platform_audit(
    'plan_status', null, null, '',
    jsonb_build_object('plan_id', v_row.id, 'name', v_row.name, 'status', v_row.status)
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Default registration settings
-- ---------------------------------------------------------------------------
create or replace function public.platform_get_subscription_settings()
returns table (
  default_plan_id uuid,
  default_plan_name text,
  default_plan_status text,
  default_duration_days integer,
  auto_assign_enabled boolean,
  last_assign_error text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.platform_require_admin();
  return query
    select s.default_plan_id,
           p.name,
           p.status,
           s.default_duration_days,
           s.auto_assign_enabled,
           s.last_assign_error,
           s.updated_at
    from public.platform_subscription_settings s
    left join public.platform_subscription_plans p on p.id = s.default_plan_id
    where s.id = 1;
end;
$$;

create or replace function public.platform_set_subscription_settings(
  p_default_plan_id uuid,
  p_default_duration_days integer,
  p_auto_assign_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_enabled boolean;
  v_plan public.platform_subscription_plans;
begin
  perform public.platform_require_admin();
  v_days := coalesce(p_default_duration_days, 0);
  if v_days < 1 or v_days > 3650 then
    raise exception 'Default duration must be between 1 and 3650 days' using errcode = '22023';
  end if;
  v_enabled := coalesce(p_auto_assign_enabled, false);

  if v_enabled then
    if p_default_plan_id is null then
      raise exception 'Select an active plan before enabling automatic assignment' using errcode = '22023';
    end if;
    select * into v_plan from public.platform_subscription_plans where id = p_default_plan_id;
    if not found then
      raise exception 'Select an active plan before enabling automatic assignment' using errcode = '22023';
    end if;
    if v_plan.status <> 'active' then
      raise exception 'The default plan must be active' using errcode = '22023';
    end if;
  elsif p_default_plan_id is not null then
    select * into v_plan from public.platform_subscription_plans where id = p_default_plan_id;
    if not found then
      raise exception 'Plan not found' using errcode = 'P0002';
    end if;
  end if;

  update public.platform_subscription_settings
    set default_plan_id = p_default_plan_id,
        default_duration_days = v_days,
        auto_assign_enabled = v_enabled,
        last_assign_error = '',
        updated_at = now()
    where id = 1;

  perform public.platform_audit(
    'subscription_settings', null, null, '',
    jsonb_build_object(
      'default_plan_id', p_default_plan_id,
      'default_duration_days', v_days,
      'auto_assign_enabled', v_enabled
    )
  );

  return jsonb_build_object(
    'default_plan_id', p_default_plan_id,
    'default_duration_days', v_days,
    'auto_assign_enabled', v_enabled
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Assign / switch plan (validity preserved unless founder opts in)
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
  );

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
      'status', (select status from public.restaurants where id = p_restaurant_id)
    )
  );

  return jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'plan_id', p_plan_id,
    'change_validity', v_change,
    'valid_from', v_from,
    'valid_until', v_until
  );
end;
$$;

create or replace function public.platform_list_assignments(p_restaurant_id uuid)
returns table (
  id uuid,
  restaurant_id uuid,
  plan_id uuid,
  plan_name text,
  previous_plan_id uuid,
  previous_plan_name text,
  source text,
  note text,
  change_validity boolean,
  valid_from timestamptz,
  valid_until timestamptz,
  previous_valid_from timestamptz,
  previous_valid_until timestamptz,
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
    select a.id, a.restaurant_id, a.plan_id, coalesce(p.name, ''),
           a.previous_plan_id, coalesce(prev.name, ''),
           a.source, a.note, a.change_validity,
           a.valid_from, a.valid_until, a.previous_valid_from, a.previous_valid_until,
           a.created_at
    from public.platform_subscription_assignments a
    left join public.platform_subscription_plans p on p.id = a.plan_id
    left join public.platform_subscription_plans prev on prev.id = a.previous_plan_id
    where a.restaurant_id = p_restaurant_id
    order by a.created_at desc
    limit 50;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Auto-assign on NEW restaurant insert only
-- ---------------------------------------------------------------------------
create or replace function public.platform_apply_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.platform_subscription_settings;
  v_plan public.platform_subscription_plans;
  v_from timestamptz;
  v_until timestamptz;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if new.plan_id is not null then
    return new;
  end if;
  if exists (select 1 from public.platform_subscription_assignments where restaurant_id = new.id) then
    return new;
  end if;

  select * into v_settings from public.platform_subscription_settings where id = 1;
  if not found or not v_settings.auto_assign_enabled then
    return new;
  end if;

  if v_settings.default_plan_id is null then
    update public.platform_subscription_settings
      set last_assign_error = 'Automatic assignment is enabled but no default plan is selected.',
          updated_at = now()
      where id = 1;
    return new;
  end if;

  select * into v_plan from public.platform_subscription_plans where id = v_settings.default_plan_id;
  if v_plan.id is null or v_plan.status <> 'active' then
    update public.platform_subscription_settings
      set last_assign_error = 'Automatic assignment is enabled but the default plan is missing or inactive.',
          updated_at = now()
      where id = 1;
    return new;
  end if;

  v_from := date_trunc('day', timezone('utc', now()));
  v_until := v_from + (v_settings.default_duration_days || ' days')::interval;

  update public.restaurants
    set plan_id = v_plan.id,
        valid_from = coalesce(valid_from, v_from),
        valid_until = coalesce(valid_until, v_until)
    where id = new.id
      and plan_id is null;

  if not found then
    return new;
  end if;

  insert into public.platform_subscription_assignments (
    restaurant_id, plan_id, previous_plan_id, actor_id, source, note,
    change_validity, valid_from, valid_until, previous_valid_from, previous_valid_until
  ) values (
    new.id, v_plan.id, null, null, 'registration',
    'Automatic default assignment for new restaurant',
    true, coalesce(new.valid_from, v_from), coalesce(new.valid_until, v_until),
    new.valid_from, new.valid_until
  );

  update public.platform_subscription_settings
    set last_assign_error = '',
        updated_at = now()
    where id = 1;

  return new;
end;
$$;

drop trigger if exists restaurants_apply_default_subscription on public.restaurants;
create trigger restaurants_apply_default_subscription
  after insert on public.restaurants
  for each row
  execute function public.platform_apply_default_subscription();

-- ---------------------------------------------------------------------------
-- 10. Directory RPCs include current plan (service_role / edge function)
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
-- 11. Grants — founder RPCs self-authorize via platform_require_admin()
-- ---------------------------------------------------------------------------
revoke all on function public.platform_list_plans(boolean) from public, anon;
revoke all on function public.platform_upsert_plan(uuid, text, text, numeric, text, integer, jsonb, integer, text, integer) from public, anon;
revoke all on function public.platform_set_plan_status(uuid, text) from public, anon;
revoke all on function public.platform_get_subscription_settings() from public, anon;
revoke all on function public.platform_set_subscription_settings(uuid, integer, boolean) from public, anon;
revoke all on function public.platform_assign_subscription(uuid, uuid, boolean, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.platform_list_assignments(uuid) from public, anon;

grant execute on function public.platform_list_plans(boolean) to authenticated;
grant execute on function public.platform_upsert_plan(uuid, text, text, numeric, text, integer, jsonb, integer, text, integer) to authenticated;
grant execute on function public.platform_set_plan_status(uuid, text) to authenticated;
grant execute on function public.platform_get_subscription_settings() to authenticated;
grant execute on function public.platform_set_subscription_settings(uuid, integer, boolean) to authenticated;
grant execute on function public.platform_assign_subscription(uuid, uuid, boolean, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.platform_list_assignments(uuid) to authenticated;
