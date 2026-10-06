-- BSB Digital Menu — Phase 15 global restaurant settings (additive).
-- Configuration foundation only. Does not recreate restaurants, waiters, tables,
-- sessions, orders, KOTs, bills, or payments. Does not store passwords or secrets.
-- Does not send printer jobs. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. restaurant_settings (one row per restaurant)
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_settings (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  restaurant_type text not null default '',
  owner_name text not null default '',
  email text not null default '',
  alternate_phone text not null default '',
  gstin text not null default '',
  fssai text not null default '',
  city text not null default '',
  state text not null default '',
  pin text not null default '',
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  website text not null default '',
  facebook text not null default '',
  instagram text not null default '',
  google_maps text not null default '',
  tagline text not null default '',
  thank_you_message text not null default '',
  terms text not null default '',
  primary_color text not null default '#1f3d32',
  secondary_color text not null default '#c4a574',
  mark_url text,
  tax_enabled boolean not null default false,
  tax_mode text not null default 'exclusive',
  rounding text not null default 'none',
  kot jsonb not null default '{}'::jsonb,
  bill jsonb not null default '{}'::jsonb,
  qr jsonb not null default '{}'::jsonb,
  orders jsonb not null default '{}'::jsonb,
  floor jsonb not null default '{}'::jsonb,
  kitchen jsonb not null default '{}'::jsonb,
  discounts jsonb not null default '{}'::jsonb,
  waiters jsonb not null default '{}'::jsonb,
  notifications jsonb not null default '{}'::jsonb,
  security jsonb not null default '{}'::jsonb,
  advanced jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_settings_tax_mode_check check (tax_mode in ('exclusive', 'inclusive')),
  constraint restaurant_settings_rounding_check check (rounding in ('none', 'nearest', 'up', 'down')),
  constraint restaurant_settings_currency_check check (char_length(currency) = 3)
);

drop trigger if exists restaurant_settings_set_updated_at on public.restaurant_settings;
create trigger restaurant_settings_set_updated_at
  before update on public.restaurant_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. working hours
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_working_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  day_of_week smallint not null,
  is_open boolean not null default true,
  open_time time not null default '11:00',
  close_time time not null default '23:00',
  constraint restaurant_working_hours_day_check check (day_of_week between 0 and 6),
  constraint restaurant_working_hours_unique unique (restaurant_id, day_of_week)
);

create index if not exists restaurant_working_hours_restaurant_idx
  on public.restaurant_working_hours (restaurant_id, day_of_week);

-- ---------------------------------------------------------------------------
-- 3. tax rates
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_tax_rates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null default '',
  rate numeric(6, 2) not null default 0,
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint restaurant_tax_rates_rate_check check (rate >= 0 and rate <= 100),
  constraint restaurant_tax_rates_name_len check (char_length(name) <= 40)
);

create index if not exists restaurant_tax_rates_restaurant_idx
  on public.restaurant_tax_rates (restaurant_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4. service charges
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_service_charges (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  is_enabled boolean not null default false,
  charge_type text not null default 'percent',
  value numeric(10, 2) not null default 0,
  is_taxable boolean not null default false,
  sort_order int not null default 0,
  constraint restaurant_service_charges_type_check check (charge_type in ('percent', 'fixed')),
  constraint restaurant_service_charges_value_check check (value >= 0)
);

create index if not exists restaurant_service_charges_restaurant_idx
  on public.restaurant_service_charges (restaurant_id, sort_order);

-- ---------------------------------------------------------------------------
-- 5. payment methods
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_payment_methods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  method text not null,
  label text not null default '',
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  upi_id text not null default '',
  display_name text not null default '',
  reference_required boolean not null default false,
  constraint restaurant_payment_methods_method_check check (method in ('cash', 'upi', 'card')),
  constraint restaurant_payment_methods_unique unique (restaurant_id, method)
);

create index if not exists restaurant_payment_methods_restaurant_idx
  on public.restaurant_payment_methods (restaurant_id, sort_order);

-- ---------------------------------------------------------------------------
-- 6. printer profiles (configuration only)
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_printer_profiles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  printer_type text not null default 'thermal',
  connection_type text not null default 'network',
  paper_width text not null default '80mm',
  is_active boolean not null default true,
  is_default_kot boolean not null default false,
  is_default_bill boolean not null default false,
  is_default_receipt boolean not null default false,
  is_default_kitchen boolean not null default false,
  route_by text not null default 'none',
  route_value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_printer_profiles_name_not_blank check (btrim(name) <> ''),
  constraint restaurant_printer_profiles_type_check check (printer_type in ('thermal', 'kitchen', 'laser')),
  constraint restaurant_printer_profiles_connection_check check (connection_type in ('usb', 'network', 'bluetooth')),
  constraint restaurant_printer_profiles_paper_check check (paper_width in ('58mm', '80mm', 'a4')),
  constraint restaurant_printer_profiles_route_check check (route_by in ('none', 'category', 'item', 'station'))
);

drop trigger if exists restaurant_printer_profiles_set_updated_at on public.restaurant_printer_profiles;
create trigger restaurant_printer_profiles_set_updated_at
  before update on public.restaurant_printer_profiles
  for each row execute function public.set_updated_at();

create index if not exists restaurant_printer_profiles_restaurant_idx
  on public.restaurant_printer_profiles (restaurant_id, name);

-- ---------------------------------------------------------------------------
-- 7. roles + permissions (does not replace profiles.role / waiter auth)
-- ---------------------------------------------------------------------------

create table if not exists public.restaurant_roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  role_key text not null,
  name text not null,
  is_system boolean not null default true,
  sort_order int not null default 0,
  constraint restaurant_roles_key_check check (role_key in ('owner', 'manager', 'waiter', 'cashier', 'kitchen')),
  constraint restaurant_roles_unique unique (restaurant_id, role_key)
);

create table if not exists public.restaurant_role_permissions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  role_id uuid not null references public.restaurant_roles (id) on delete cascade,
  permission_key text not null,
  allowed boolean not null default false,
  constraint restaurant_role_permissions_key_check check (
    permission_key in (
      'orders', 'kitchen', 'bills', 'payments', 'discounts', 'collections',
      'tables', 'waiters', 'menu', 'reports', 'printing', 'settings'
    )
  ),
  constraint restaurant_role_permissions_unique unique (role_id, permission_key)
);

create index if not exists restaurant_roles_restaurant_idx
  on public.restaurant_roles (restaurant_id, sort_order);

create index if not exists restaurant_role_permissions_restaurant_idx
  on public.restaurant_role_permissions (restaurant_id);

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------

alter table public.restaurant_settings enable row level security;
alter table public.restaurant_working_hours enable row level security;
alter table public.restaurant_tax_rates enable row level security;
alter table public.restaurant_service_charges enable row level security;
alter table public.restaurant_payment_methods enable row level security;
alter table public.restaurant_printer_profiles enable row level security;
alter table public.restaurant_roles enable row level security;
alter table public.restaurant_role_permissions enable row level security;

drop policy if exists "owners manage restaurant settings" on public.restaurant_settings;
create policy "owners manage restaurant settings"
  on public.restaurant_settings for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read restaurant settings" on public.restaurant_settings;
create policy "waiters read restaurant settings"
  on public.restaurant_settings for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage working hours" on public.restaurant_working_hours;
create policy "owners manage working hours"
  on public.restaurant_working_hours for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read working hours" on public.restaurant_working_hours;
create policy "waiters read working hours"
  on public.restaurant_working_hours for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage tax rates" on public.restaurant_tax_rates;
create policy "owners manage tax rates"
  on public.restaurant_tax_rates for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read tax rates" on public.restaurant_tax_rates;
create policy "waiters read tax rates"
  on public.restaurant_tax_rates for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage service charges" on public.restaurant_service_charges;
create policy "owners manage service charges"
  on public.restaurant_service_charges for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read service charges" on public.restaurant_service_charges;
create policy "waiters read service charges"
  on public.restaurant_service_charges for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage payment methods" on public.restaurant_payment_methods;
create policy "owners manage payment methods"
  on public.restaurant_payment_methods for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read payment methods" on public.restaurant_payment_methods;
create policy "waiters read payment methods"
  on public.restaurant_payment_methods for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage printer profiles" on public.restaurant_printer_profiles;
create policy "owners manage printer profiles"
  on public.restaurant_printer_profiles for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read printer profiles" on public.restaurant_printer_profiles;
create policy "waiters read printer profiles"
  on public.restaurant_printer_profiles for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage restaurant roles" on public.restaurant_roles;
create policy "owners manage restaurant roles"
  on public.restaurant_roles for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read restaurant roles" on public.restaurant_roles;
create policy "waiters read restaurant roles"
  on public.restaurant_roles for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());

drop policy if exists "owners manage role permissions" on public.restaurant_role_permissions;
create policy "owners manage role permissions"
  on public.restaurant_role_permissions for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "waiters read role permissions" on public.restaurant_role_permissions;
create policy "waiters read role permissions"
  on public.restaurant_role_permissions for select
  to authenticated
  using (restaurant_id = public.current_waiter_restaurant_id());
