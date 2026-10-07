-- BSB Digital Menu — Phase 17 KOT printing and printer routing (additive).
-- Extends restaurant_printer_profiles. Does not recreate orders, KOTs, bills,
-- payments, tables, or sessions. Does not store secrets. Physical USB/network
-- hardware is not claimed; jobs still use browser/system print. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. printer profiles: browser/system connection, use-for, address
-- ---------------------------------------------------------------------------

alter table public.restaurant_printer_profiles
  drop constraint if exists restaurant_printer_profiles_connection_check;

alter table public.restaurant_printer_profiles
  add constraint restaurant_printer_profiles_connection_check
  check (connection_type in ('usb', 'network', 'bluetooth', 'browser', 'system'));

alter table public.restaurant_printer_profiles
  add column if not exists use_for text not null default 'kot';

alter table public.restaurant_printer_profiles
  drop constraint if exists restaurant_printer_profiles_use_for_check;

alter table public.restaurant_printer_profiles
  add constraint restaurant_printer_profiles_use_for_check
  check (use_for in ('kot', 'bill', 'receipt', 'kitchen'));

alter table public.restaurant_printer_profiles
  add column if not exists address text not null default '';

alter table public.restaurant_printer_profiles
  add column if not exists host text not null default '';

alter table public.restaurant_printer_profiles
  add column if not exists port text not null default '';

-- ---------------------------------------------------------------------------
-- 2. routing rules (Menu Item → Category → Order Type → Default Printer)
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_printer_routes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  printer_id uuid not null references public.restaurant_printer_profiles (id) on delete cascade,
  route_type text not null,
  route_value text not null default '',
  created_at timestamptz not null default now(),
  constraint restaurant_printer_routes_type_check
    check (route_type in ('item', 'category', 'order_type')),
  constraint restaurant_printer_routes_value_not_blank check (btrim(route_value) <> ''),
  constraint restaurant_printer_routes_unique unique (restaurant_id, route_type, route_value)
);

create index if not exists restaurant_printer_routes_restaurant_idx
  on public.restaurant_printer_routes (restaurant_id, route_type);

create index if not exists restaurant_printer_routes_printer_idx
  on public.restaurant_printer_routes (printer_id);

-- ---------------------------------------------------------------------------
-- 3. print jobs (idempotent per restaurant + KOT + printer + print type)
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_print_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  kot_id uuid references public.kots (id) on delete cascade,
  printer_id uuid references public.restaurant_printer_profiles (id) on delete set null,
  print_type text not null default 'kot',
  status text not null default 'queued',
  is_reprint boolean not null default false,
  copies int not null default 1,
  error_message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_print_jobs_type_check
    check (print_type in ('kot', 'test', 'bill', 'receipt')),
  constraint restaurant_print_jobs_status_check
    check (status in ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  constraint restaurant_print_jobs_copies_check check (copies > 0)
);

drop trigger if exists restaurant_print_jobs_set_updated_at on public.restaurant_print_jobs;
create trigger restaurant_print_jobs_set_updated_at
  before update on public.restaurant_print_jobs
  for each row execute function public.set_updated_at();

create unique index if not exists restaurant_print_jobs_idempotent_idx
  on public.restaurant_print_jobs (restaurant_id, kot_id, printer_id, print_type)
  where is_reprint = false and print_type = 'kot' and kot_id is not null and printer_id is not null;

create index if not exists restaurant_print_jobs_restaurant_idx
  on public.restaurant_print_jobs (restaurant_id, created_at desc);

create index if not exists restaurant_print_jobs_kot_idx
  on public.restaurant_print_jobs (kot_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.restaurant_printer_routes enable row level security;
alter table public.restaurant_print_jobs enable row level security;

drop policy if exists "owners manage printer routes" on public.restaurant_printer_routes;
create policy "owners manage printer routes"
  on public.restaurant_printer_routes for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read printer routes" on public.restaurant_printer_routes;
create policy "waiters read printer routes"
  on public.restaurant_printer_routes for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage print jobs" on public.restaurant_print_jobs;
create policy "owners manage print jobs"
  on public.restaurant_print_jobs for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read print jobs" on public.restaurant_print_jobs;
create policy "waiters read print jobs"
  on public.restaurant_print_jobs for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "waiters insert print jobs" on public.restaurant_print_jobs;
create policy "waiters insert print jobs"
  on public.restaurant_print_jobs for insert
  to authenticated
  with check (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "waiters update print jobs" on public.restaurant_print_jobs;
create policy "waiters update print jobs"
  on public.restaurant_print_jobs for update
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id())
  with check (restaurant_id = public.current_waiter_restaurant_id());

-- Stamp printed_at only. Kitchen status stays owner-only (kitchen-kot.sql).
create or replace function public.stamp_kot_printed(p_kot_id uuid, p_restaurant_id uuid)
returns public.kots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kot public.kots;
begin
  if p_kot_id is null or p_restaurant_id is null then
    raise exception 'Kitchen ticket not found.';
  end if;
  if not (
    public.is_restaurant_owner(p_restaurant_id)
    or p_restaurant_id = public.current_waiter_restaurant_id()
  ) then
    raise exception 'not allowed';
  end if;

  update public.kots
     set printed_at = now()
   where id = p_kot_id
     and restaurant_id = p_restaurant_id
  returning * into v_kot;

  if v_kot.id is null then
    raise exception 'Kitchen ticket not found.';
  end if;
  return v_kot;
end;
$$;

revoke all on function public.stamp_kot_printed(uuid, uuid) from public;
grant execute on function public.stamp_kot_printed(uuid, uuid) to authenticated;
