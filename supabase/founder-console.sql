-- BSB Digital Menu — Phase 22 extension: Founder Admin Console, restaurant
-- access control, audited support sessions and founder-only menu import.
--
-- Safe to run on existing projects. Additive only: no table is dropped and no
-- existing restaurant/order/bill/payment row is deleted.
--
-- >>> RUN THIS FILE LAST, AFTER every other supabase/*.sql migration. <<<
-- It intentionally redefines is_restaurant_owner()/current_waiter_restaurant_id()
-- and the "owners manage *" policies so restaurant access control (frozen /
-- blocked / expired) and founder support sessions are enforced server-side.
-- Running an older migration afterwards (e.g. waiter-auth.sql) would recreate an
-- um-gated policy.
--
-- Enforcement model (server-side, never client-trusting):
--   * restaurant_effective_status() derives Active/Frozen/Blocked/Expired.
--   * restaurant_access_ok() gates owner/waiter access.
--   * platform_is_admin() checks the platform_admins allowlist for auth.uid().
--   * platform_support_active() grants a platform admin tenant access ONLY for
--     the single restaurant of an active, unexpired support session.
--   * is_restaurant_owner() = genuine owner OR an active founder support session,
--     so every existing "owners manage *" policy and owner-gated RPC automatically
--     honours support sessions without weakening tenant isolation.
--   * is_restaurant_staff_owner() is the strict owner-only check, used for the
--     restaurant row itself so a support session can never transfer ownership.
--   * All founder mutations are SECURITY DEFINER RPCs that re-check
--     platform_is_admin() and write to the audit log.

-- ---------------------------------------------------------------------------
-- 1. Restaurant access control columns
-- ---------------------------------------------------------------------------
alter table public.restaurants add column if not exists valid_from timestamptz;
alter table public.restaurants add column if not exists valid_until timestamptz;

alter table public.restaurants drop constraint if exists restaurants_status_check;
alter table public.restaurants
  add constraint restaurants_status_check
  check (status in ('active', 'frozen', 'blocked', 'expired', 'inactive', 'suspended'));

create index if not exists restaurants_valid_until_idx on public.restaurants (valid_until);

-- ---------------------------------------------------------------------------
-- 2. Per-account block flags (owner profile + waiter)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.waiters add column if not exists is_blocked boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Audited founder support (impersonation) sessions
-- ---------------------------------------------------------------------------
create table if not exists public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid not null references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  status text not null default 'active',
  recovery boolean not null default false,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '8 hours'),
  ended_at timestamptz,
  end_reason text not null default '',
  constraint platform_support_sessions_status_check check (status in ('active', 'ended'))
);

create index if not exists platform_support_sessions_lookup_idx
  on public.platform_support_sessions (founder_id, restaurant_id, status);

alter table public.platform_support_sessions enable row level security;
revoke all on public.platform_support_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Audit log extension (table created in platform-admin.sql)
-- ---------------------------------------------------------------------------
alter table public.platform_audit_log add column if not exists actor_username text not null default '';
alter table public.platform_audit_log add column if not exists target_user_id uuid;
alter table public.platform_audit_log add column if not exists reason text not null default '';

-- ---------------------------------------------------------------------------
-- 5. Core security-definer helpers
-- ---------------------------------------------------------------------------
create or replace function public.platform_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

create or replace function public.restaurant_effective_status(p_restaurant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.status in ('frozen', 'blocked') then r.status
    when r.valid_until is not null and r.valid_until < now() then 'expired'
    when r.status = 'active' then 'active'
    else coalesce(r.status, 'active')
  end
  from public.restaurants r
  where r.id = p_restaurant_id;
$$;

create or replace function public.restaurant_access_ok(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.restaurant_effective_status(p_restaurant_id) = 'active';
$$;

create or replace function public.account_not_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce(
    (select p.is_blocked from public.profiles p where p.id = p_user_id),
    false
  );
$$;

create or replace function public.platform_support_active(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.platform_is_admin() and exists (
    select 1
    from public.platform_support_sessions s
    where s.founder_id = auth.uid()
      and s.restaurant_id = p_restaurant_id
      and s.status = 'active'
      and s.expires_at > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Identity helpers. is_restaurant_owner() is the support-aware check used by
--    every existing "owners manage *" policy and owner-gated RPC.
-- ---------------------------------------------------------------------------
-- Strict owner-only check (never satisfied by a support session).
create or replace function public.is_restaurant_staff_owner(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurants r
    where r.id = p_restaurant_id
      and r.user_id = auth.uid()
      and public.account_not_blocked(r.user_id)
      and public.restaurant_access_ok(r.id)
  );
$$;

create or replace function public.is_restaurant_owner(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_restaurant_staff_owner(p_restaurant_id)
      or public.platform_support_active(p_restaurant_id);
$$;

create or replace function public.current_waiter_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select w.restaurant_id
  from public.waiters w
  where w.auth_user_id = auth.uid()
    and w.is_active = true
    and w.is_blocked = false
    and public.restaurant_access_ok(w.restaurant_id)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 7. Re-point owner policies that inline-checked ownership to the gated helper
--    so frozen/blocked/expired restaurants lose access everywhere and support
--    sessions gain tenant access through the same policies.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'menu_items', 'restaurant_tables', 'orders', 'order_items',
    'kots', 'kot_items', 'bills', 'payments', 'waiters',
    'waiter_table_assignments', 'table_sessions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'owners manage ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_restaurant_owner(restaurant_id)) '
      || 'with check (public.is_restaurant_owner(restaurant_id))',
      'owners manage ' || t, t
    );
  end loop;
end;
$$;

-- session_tables has no restaurant_id column; resolve through table_sessions.
drop policy if exists "owners manage session_tables" on public.session_tables;
create policy "owners manage session_tables"
  on public.session_tables for all
  to authenticated
  using (
    exists (
      select 1 from public.table_sessions ts
      where ts.id = session_id and public.is_restaurant_owner(ts.restaurant_id)
    )
  )
  with check (
    exists (
      select 1 from public.table_sessions ts
      where ts.id = session_id and public.is_restaurant_owner(ts.restaurant_id)
    )
  );

-- Restaurants: owners may read even when frozen/expired (so the dashboard can
-- explain the state); support sessions get read-only tenant access; only the
-- genuine owner (strict check) may write, so ownership can never be transferred
-- by a support session.
drop policy if exists "owners manage restaurants" on public.restaurants;
drop policy if exists "owners read own restaurants" on public.restaurants;
drop policy if exists "owners write own restaurants" on public.restaurants;
drop policy if exists "platform admin read supported restaurant" on public.restaurants;

create policy "owners read own restaurants"
  on public.restaurants for select
  to authenticated
  using (
    (auth.uid() = user_id and public.account_not_blocked(auth.uid()))
    or public.platform_support_active(id)
  );
create policy "owners write own restaurants"
  on public.restaurants for all
  to authenticated
  using (public.is_restaurant_staff_owner(id))
  with check (public.is_restaurant_staff_owner(id));

-- ---------------------------------------------------------------------------
-- 8. Internal audit helper
-- ---------------------------------------------------------------------------
create or replace function public.platform_audit(
  p_action text,
  p_restaurant_id uuid default null,
  p_target_user_id uuid default null,
  p_reason text default '',
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_email text;
begin
  select coalesce(p.username, ''), coalesce(u.email, '')
    into v_username, v_email
  from public.platform_admins a
  left join public.profiles p on p.id = a.user_id
  left join auth.users u on u.id = a.user_id
  where a.user_id = auth.uid();

  insert into public.platform_audit_log
    (actor_id, actor_email, actor_username, action, target_restaurant_id, target_user_id, reason, details)
  values
    (auth.uid(), coalesce(v_email, ''), coalesce(v_username, ''), p_action,
     p_restaurant_id, p_target_user_id, coalesce(p_reason, ''), coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.platform_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.platform_is_admin() then
    raise exception 'Platform admin access required' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Founder support session RPCs
-- ---------------------------------------------------------------------------
create or replace function public.platform_start_support_session(
  p_restaurant_id uuid,
  p_recovery boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
  v_name text;
begin
  perform public.platform_require_admin();

  select name into v_name from public.restaurants where id = p_restaurant_id;
  if v_name is null then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  v_status := public.restaurant_effective_status(p_restaurant_id);
  if v_status <> 'active' and not (p_recovery and v_status in ('frozen', 'expired')) then
    raise exception 'Restaurant access is % — a support session cannot be started', v_status
      using errcode = '42501';
  end if;

  update public.platform_support_sessions
    set status = 'ended', ended_at = now(), end_reason = 'superseded'
    where founder_id = auth.uid() and status = 'active';

  insert into public.platform_support_sessions (founder_id, restaurant_id, recovery)
  values (auth.uid(), p_restaurant_id, p_recovery)
  returning id into v_id;

  perform public.platform_audit('support_start', p_restaurant_id, null,
    case when p_recovery then 'recovery' else '' end,
    jsonb_build_object('session_id', v_id, 'recovery', p_recovery, 'restaurant_name', v_name));
  return v_id;
end;
$$;

create or replace function public.platform_end_support_session(
  p_session_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.platform_support_sessions%rowtype;
begin
  perform public.platform_require_admin();

  select * into v_session from public.platform_support_sessions
    where id = p_session_id and founder_id = auth.uid();
  if not found then
    raise exception 'Support session not found' using errcode = 'P0002';
  end if;

  update public.platform_support_sessions
    set status = 'ended', ended_at = now(), end_reason = coalesce(p_reason, '')
    where id = p_session_id and status = 'active';

  perform public.platform_audit('support_end', v_session.restaurant_id, null, coalesce(p_reason, ''),
    jsonb_build_object('session_id', p_session_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Restaurant and account access control RPCs
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
        else 'active'
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

  -- Freezing/blocking immediately invalidates any open support session.
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

create or replace function public.platform_manage_account(
  p_restaurant_id uuid,
  p_target_user_id uuid,
  p_account_type text,
  p_action text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked boolean;
  v_affected int := 0;
begin
  perform public.platform_require_admin();

  if p_account_type not in ('owner', 'waiter') then
    raise exception 'account_type must be owner or waiter' using errcode = '22023';
  end if;
  if p_action not in ('block', 'unblock') then
    raise exception 'action must be block or unblock' using errcode = '22023';
  end if;
  v_blocked := p_action = 'block';

  if p_account_type = 'owner' then
    if not exists (
      select 1 from public.restaurants
      where id = p_restaurant_id and user_id = p_target_user_id
    ) then
      raise exception 'Owner does not belong to this restaurant' using errcode = '42501';
    end if;
    update public.profiles set is_blocked = v_blocked where id = p_target_user_id;
    get diagnostics v_affected = row_count;
  else
    update public.waiters
      set is_blocked = v_blocked, is_active = not v_blocked
      where auth_user_id = p_target_user_id and restaurant_id = p_restaurant_id;
    get diagnostics v_affected = row_count;
  end if;

  perform public.platform_audit(
    p_account_type || '_' || p_action, p_restaurant_id, p_target_user_id, coalesce(p_reason, ''),
    jsonb_build_object('affected', v_affected)
  );

  return jsonb_build_object('affected', v_affected, 'blocked', v_blocked);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Founder-only menu import. Rows validated server-side; existing items are
--     never deleted; every row is scoped to the selected restaurant.
-- ---------------------------------------------------------------------------
create or replace function public.platform_import_menu(
  p_restaurant_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_categories int := 0;
  v_created_items int := 0;
  v_skipped int := 0;
  v_row jsonb;
  v_cat_name text;
  v_cat_id uuid;
  v_name text;
  v_price numeric;
  v_sort int := 0;
  v_food text;
begin
  perform public.platform_require_admin();

  if not exists (select 1 from public.restaurants where id = p_restaurant_id) then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_cat_name := btrim(coalesce(v_row->>'category', ''));
    v_name := btrim(coalesce(v_row->>'name', ''));
    v_price := coalesce((v_row->>'price')::numeric, -1);

    if v_cat_name = '' or v_name = '' or v_price < 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select id into v_cat_id from public.categories
      where restaurant_id = p_restaurant_id and lower(name) = lower(v_cat_name) limit 1;

    if v_cat_id is null then
      insert into public.categories (restaurant_id, name, sort_order)
      values (p_restaurant_id, v_cat_name, v_created_categories)
      returning id into v_cat_id;
      v_created_categories := v_created_categories + 1;
    end if;

    v_food := case when coalesce(v_row->>'food_type', '') in ('non_veg', 'non-veg', 'nonveg')
                   then 'non_veg' else 'veg' end;

    insert into public.menu_items
      (restaurant_id, category_id, name, description, price, variants,
       image_url, is_available, food_type, sort_order)
    values (
      p_restaurant_id, v_cat_id, v_name,
      coalesce(v_row->>'description', ''),
      v_price,
      coalesce(v_row->'variants', '[]'::jsonb),
      nullif(v_row->>'image_url', ''),
      coalesce((v_row->>'is_available')::boolean, true),
      v_food, v_sort
    );
    v_sort := v_sort + 1;
    v_created_items := v_created_items + 1;
  end loop;

  perform public.platform_audit('menu_import', p_restaurant_id, null, '',
    jsonb_build_object('created_items', v_created_items,
                       'created_categories', v_created_categories,
                       'skipped', v_skipped));

  return jsonb_build_object(
    'created_items', v_created_items,
    'created_categories', v_created_categories,
    'skipped', v_skipped
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Admin audit read (RLS also denies everyone but the function self-checks)
-- ---------------------------------------------------------------------------
create or replace function public.platform_list_audit(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  actor_id uuid,
  actor_username text,
  action text,
  target_restaurant_id uuid,
  target_restaurant_name text,
  target_user_id uuid,
  reason text,
  details jsonb,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.actor_id, a.actor_username, a.action,
    a.target_restaurant_id, coalesce(r.name, ''), a.target_user_id,
    a.reason, a.details, a.created_at, count(*) over()
  from public.platform_audit_log a
  left join public.restaurants r on r.id = a.target_restaurant_id
  where public.platform_is_admin()
  order by a.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- 13. Grants — founder RPCs callable by authenticated but self-authorizing
-- ---------------------------------------------------------------------------
revoke all on function public.platform_start_support_session(uuid, boolean) from public, anon;
revoke all on function public.platform_end_support_session(uuid, text) from public, anon;
revoke all on function public.platform_manage_restaurant(uuid, text, integer, text) from public, anon;
revoke all on function public.platform_manage_account(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.platform_import_menu(uuid, jsonb) from public, anon;
revoke all on function public.platform_list_audit(integer, integer) from public, anon;

grant execute on function public.platform_start_support_session(uuid, boolean) to authenticated;
grant execute on function public.platform_end_support_session(uuid, text) to authenticated;
grant execute on function public.platform_manage_restaurant(uuid, text, integer, text) to authenticated;
grant execute on function public.platform_manage_account(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.platform_import_menu(uuid, jsonb) to authenticated;
grant execute on function public.platform_list_audit(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Refresh the platform directory RPC (access/validity/account data)
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
    select r.id, r.name, r.slug, r.user_id, r.phone, r.status,
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
    b.eff_status, b.valid_from, b.valid_until,
    case when b.valid_until is null then null
         else greatest(0, ceil(extract(epoch from (b.valid_until - now())) / 86400))::int end,
    (select count(*) from public.restaurant_tables t where t.restaurant_id = b.id),
    (select count(*) from public.menu_items m where m.restaurant_id = b.id),
    (select count(*) from public.waiters w where w.restaurant_id = b.id),
    b.created_at,
    count(*) over()
  from base b
  order by b.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke all on function public.platform_restaurants(text, text, int, int) from public, anon, authenticated;
grant execute on function public.platform_restaurants(text, text, int, int) to service_role;

-- Detail RPC gains effective status, validity and owner_blocked.
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
  where r.id = p_id;
$$;

revoke all on function public.platform_restaurant_detail(uuid) from public, anon, authenticated;
grant execute on function public.platform_restaurant_detail(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 15. Optional scheduled status sync (expiry). Requires pg_cron. Authorization
--     already enforces expiry live; this only tidies the stored status column.
-- ---------------------------------------------------------------------------
create or replace function public.sync_restaurant_expiry()
returns void
language sql
security definer
set search_path = public
as $$
  update public.restaurants
    set status = 'expired'
    where status = 'active'
      and valid_until is not null
      and valid_until < now();
$$;

-- To schedule (run manually in the SQL editor if pg_cron is enabled):
--   select cron.schedule('bsb-sync-restaurant-expiry', '0 * * * *',
--                        $$select public.sync_restaurant_expiry()$$);
