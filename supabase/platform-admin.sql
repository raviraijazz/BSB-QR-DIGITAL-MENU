-- BSB Digital Menu — Phase 22 Founder Console (Platform Admin)
-- Safe to run on existing projects. Adds only new tables/columns/functions.
-- Does not modify or delete restaurants, orders, bills or payments.
--
-- BOOTSTRAP (run once, after creating the founder auth user):
--   insert into public.platform_admins (user_id, email, notes)
--   select id, email, 'Founder' from auth.users
--   where lower(email) = lower('founder@your-domain.com')
--   on conflict (user_id) do nothing;
-- Never hard-code credentials in source. Revoke with:
--   delete from public.platform_admins where user_id = '<uuid>';

-- ---------------------------------------------------------------------------
-- 1. Restaurant status (used for status badges/filters). Defaults existing rows.
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists status text not null default 'active';

alter table public.restaurants
  drop constraint if exists restaurants_status_check;

alter table public.restaurants
  add constraint restaurants_status_check
  check (status in ('active', 'inactive', 'suspended'));

create index if not exists restaurants_status_idx on public.restaurants (status);

-- ---------------------------------------------------------------------------
-- 2. Platform-admin allowlist. Server-side only (no RLS policies => deny all).
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Audit log for privileged founder actions. Append-only, server-side only.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text not null default '',
  action text not null,
  target_restaurant_id uuid references public.restaurants (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from anon, authenticated;

create index if not exists platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Read helpers (security definer, callable only by service_role).
-- ---------------------------------------------------------------------------
create or replace function public.platform_overview(p_from timestamptz, p_to timestamptz)
returns table (
  total_restaurants bigint,
  active_restaurants bigint,
  inactive_restaurants bigint,
  total_orders bigint,
  total_revenue numeric,
  active_waiters bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.restaurants),
    (select count(*) from public.restaurants where coalesce(status, 'active') = 'active'),
    (select count(*) from public.restaurants where coalesce(status, 'active') <> 'active'),
    (select count(*) from public.orders where created_at >= p_from and created_at < p_to),
    (select coalesce(sum(amount), 0) from public.payments where paid_at >= p_from and paid_at < p_to),
    (select count(*) from public.waiters where is_active);
$$;

create or replace function public.platform_restaurants(
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
  phone text,
  status text,
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
    select r.id, r.name, r.slug, r.user_id, r.phone,
           coalesce(r.status, 'active') as status, r.created_at,
           coalesce(p.username, '') as owner_username
    from public.restaurants r
    left join public.profiles p on p.id = r.user_id
    where (coalesce(p_search, '') = ''
            or r.name ilike '%' || p_search || '%'
            or coalesce(p.username, '') ilike '%' || p_search || '%')
      and (coalesce(p_status, '') = '' or coalesce(r.status, 'active') = p_status)
  )
  select b.id, b.name, b.slug, b.user_id, b.owner_username, b.phone, b.status,
    (select count(*) from public.restaurant_tables t where t.restaurant_id = b.id),
    (select count(*) from public.menu_items m where m.restaurant_id = b.id),
    (select count(*) from public.waiters w where w.restaurant_id = b.id),
    b.created_at,
    count(*) over()
  from base b
  order by b.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

create or replace function public.platform_restaurant_detail(p_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  phone text,
  address text,
  logo_url text,
  status text,
  created_at timestamptz,
  owner_id uuid,
  owner_username text,
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
    coalesce(r.status, 'active'), r.created_at, r.user_id,
    coalesce(p.username, ''),
    (select count(*) from public.restaurant_tables t where t.restaurant_id = r.id),
    (select count(*) from public.menu_items m where m.restaurant_id = r.id),
    (select count(*) from public.waiters w where w.restaurant_id = r.id),
    (select count(*) from public.orders o where o.restaurant_id = r.id),
    (select coalesce(sum(amount), 0) from public.payments pay where pay.restaurant_id = r.id)
  from public.restaurants r
  left join public.profiles p on p.id = r.user_id
  where r.id = p_id;
$$;

revoke all on function public.platform_overview(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.platform_restaurants(text, text, int, int) from public, anon, authenticated;
revoke all on function public.platform_restaurant_detail(uuid) from public, anon, authenticated;
grant execute on function public.platform_overview(timestamptz, timestamptz) to service_role;
grant execute on function public.platform_restaurants(text, text, int, int) to service_role;
grant execute on function public.platform_restaurant_detail(uuid) to service_role;
