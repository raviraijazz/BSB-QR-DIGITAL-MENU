-- BSB Digital Menu — Phase 1 table-wise order foundation.
-- Additive and safe to re-run. Does not drop existing tables or change qr_token values.
-- Does not use restaurant_tables.is_active for occupancy.
-- Table ≠ Session ≠ Order ≠ KOT ≠ Bill ≠ Payment.

-- ---------------------------------------------------------------------------
-- 1. profiles.role
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'owner';

update public.profiles
set role = 'owner'
where role is null or role not in ('owner', 'waiter');

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'waiter'));

-- ---------------------------------------------------------------------------
-- 2. restaurant_tables.capacity (do not recreate table or touch qr_token)
-- ---------------------------------------------------------------------------

alter table public.restaurant_tables
  add column if not exists capacity integer not null default 4;

alter table public.restaurant_tables
  drop constraint if exists restaurant_tables_capacity_check;

alter table public.restaurant_tables
  add constraint restaurant_tables_capacity_check
  check (capacity > 0);

-- ---------------------------------------------------------------------------
-- 3. waiters
-- ---------------------------------------------------------------------------

create table if not exists public.waiters (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  waiter_id text not null unique,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiters_waiter_id_not_blank check (btrim(waiter_id) <> ''),
  constraint waiters_full_name_not_blank check (btrim(full_name) <> '')
);

-- ---------------------------------------------------------------------------
-- 4. waiter_table_assignments
-- ---------------------------------------------------------------------------

create table if not exists public.waiter_table_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  waiter_id uuid not null references public.waiters (id) on delete cascade,
  table_id uuid not null references public.restaurant_tables (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint waiter_table_assignments_waiter_table_key unique (waiter_id, table_id)
);

-- ---------------------------------------------------------------------------
-- 5. table_sessions
-- ---------------------------------------------------------------------------

create table if not exists public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_number text not null,
  primary_table_id uuid references public.restaurant_tables (id) on delete set null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint table_sessions_number_not_blank check (btrim(session_number) <> ''),
  constraint table_sessions_status_check
    check (status in ('active', 'bill_requested', 'payment_pending', 'closed', 'cancelled')),
  constraint table_sessions_restaurant_number_key unique (restaurant_id, session_number),
  constraint table_sessions_closed_at_check
    check (
      (status in ('closed', 'cancelled') and closed_at is not null)
      or (status not in ('closed', 'cancelled') and closed_at is null)
    )
);

-- ---------------------------------------------------------------------------
-- 6. session_tables
-- ---------------------------------------------------------------------------

create table if not exists public.session_tables (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  table_id uuid not null references public.restaurant_tables (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint session_tables_session_table_key unique (session_id, table_id)
);

-- ---------------------------------------------------------------------------
-- 7. orders
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  waiter_id uuid references public.waiters (id) on delete set null,
  source_table_id uuid references public.restaurant_tables (id) on delete set null,
  order_number text not null,
  status text not null default 'new',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_number_not_blank check (btrim(order_number) <> ''),
  constraint orders_status_check
    check (status in ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled')),
  constraint orders_restaurant_number_key unique (restaurant_id, order_number)
);

-- ---------------------------------------------------------------------------
-- 8. order_items
-- ---------------------------------------------------------------------------

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name text not null,
  description text not null default '',
  food_type text,
  unit_price numeric(10, 2) not null default 0,
  quantity numeric(10, 2) not null default 1,
  line_total numeric(12, 2) not null default 0,
  notes text not null default '',
  sent_to_kitchen boolean not null default false,
  created_at timestamptz not null default now(),
  constraint order_items_name_not_blank check (btrim(item_name) <> ''),
  constraint order_items_food_type_check
    check (food_type is null or food_type in ('veg', 'non_veg')),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_unit_price_check check (unit_price >= 0),
  constraint order_items_line_total_check check (line_total >= 0)
);

-- ---------------------------------------------------------------------------
-- 9. kots
-- ---------------------------------------------------------------------------

create table if not exists public.kots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  kot_number text not null,
  kot_type text not null default 'new',
  status text not null default 'new',
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint kots_number_not_blank check (btrim(kot_number) <> ''),
  constraint kots_type_check
    check (kot_type in ('new', 'add_on', 'modification', 'cancellation', 'transfer')),
  constraint kots_status_check
    check (status in ('new', 'preparing', 'ready', 'served', 'cancelled')),
  constraint kots_restaurant_number_key unique (restaurant_id, kot_number)
);

-- ---------------------------------------------------------------------------
-- 10. kot_items
-- ---------------------------------------------------------------------------

create table if not exists public.kot_items (
  id uuid primary key default gen_random_uuid(),
  kot_id uuid not null references public.kots (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  item_name text not null,
  quantity numeric(10, 2) not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint kot_items_name_not_blank check (btrim(item_name) <> ''),
  constraint kot_items_quantity_check check (quantity > 0)
);

-- ---------------------------------------------------------------------------
-- 11. bills (one per session; discount belongs to bill, not KOT)
-- ---------------------------------------------------------------------------

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid not null unique references public.table_sessions (id) on delete cascade,
  bill_number text not null,
  subtotal numeric(12, 2) not null default 0,
  discount_type text,
  discount_value numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  taxable_amount numeric(12, 2) not null default 0,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  other_tax_amount numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bills_number_not_blank check (btrim(bill_number) <> ''),
  constraint bills_discount_type_check
    check (discount_type is null or discount_type in ('percent', 'amount')),
  constraint bills_status_check
    check (status in ('open', 'payment_pending', 'paid', 'cancelled')),
  constraint bills_restaurant_number_key unique (restaurant_id, bill_number),
  constraint bills_subtotal_check check (subtotal >= 0),
  constraint bills_discount_value_check check (discount_value >= 0),
  constraint bills_discount_amount_check check (discount_amount >= 0),
  constraint bills_taxable_amount_check check (taxable_amount >= 0),
  constraint bills_cgst_amount_check check (cgst_amount >= 0),
  constraint bills_sgst_amount_check check (sgst_amount >= 0),
  constraint bills_other_tax_amount_check check (other_tax_amount >= 0),
  constraint bills_grand_total_check check (grand_total >= 0)
);

-- ---------------------------------------------------------------------------
-- 12. payments (multiple per bill; cash + UPI + card split)
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  bill_id uuid not null references public.bills (id) on delete cascade,
  payment_method text not null,
  amount numeric(12, 2) not null,
  payment_reference text not null default '',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint payments_method_check check (payment_method in ('cash', 'upi', 'card')),
  constraint payments_amount_check check (amount > 0)
);

-- ---------------------------------------------------------------------------
-- 13. indexes
-- ---------------------------------------------------------------------------

create index if not exists waiters_restaurant_idx on public.waiters (restaurant_id);
create index if not exists waiters_restaurant_active_idx on public.waiters (restaurant_id, is_active);

create index if not exists waiter_table_assignments_restaurant_idx
  on public.waiter_table_assignments (restaurant_id);
create index if not exists waiter_table_assignments_waiter_idx
  on public.waiter_table_assignments (waiter_id);
create index if not exists waiter_table_assignments_table_idx
  on public.waiter_table_assignments (table_id);

create index if not exists table_sessions_restaurant_idx on public.table_sessions (restaurant_id);
create index if not exists table_sessions_restaurant_status_idx
  on public.table_sessions (restaurant_id, status);
create index if not exists table_sessions_primary_table_idx on public.table_sessions (primary_table_id);
create index if not exists table_sessions_status_idx on public.table_sessions (status);

create unique index if not exists table_sessions_one_open_primary_idx
  on public.table_sessions (primary_table_id)
  where primary_table_id is not null
    and status in ('active', 'bill_requested', 'payment_pending');

create index if not exists session_tables_session_idx on public.session_tables (session_id);
create index if not exists session_tables_table_idx on public.session_tables (table_id);

create index if not exists orders_restaurant_idx on public.orders (restaurant_id);
create index if not exists orders_session_idx on public.orders (session_id);
create index if not exists orders_waiter_idx on public.orders (waiter_id);
create index if not exists orders_source_table_idx on public.orders (source_table_id);
create index if not exists orders_restaurant_status_idx on public.orders (restaurant_id, status);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_menu_item_idx on public.order_items (menu_item_id);
create index if not exists order_items_sent_to_kitchen_idx
  on public.order_items (order_id, sent_to_kitchen);

create index if not exists kots_restaurant_idx on public.kots (restaurant_id);
create index if not exists kots_session_idx on public.kots (session_id);
create index if not exists kots_order_idx on public.kots (order_id);
create index if not exists kots_restaurant_status_idx on public.kots (restaurant_id, status);

create index if not exists kot_items_kot_idx on public.kot_items (kot_id);
create index if not exists kot_items_order_item_idx on public.kot_items (order_item_id);

create index if not exists bills_restaurant_idx on public.bills (restaurant_id);
create index if not exists bills_status_idx on public.bills (status);
create index if not exists bills_restaurant_status_idx on public.bills (restaurant_id, status);

create index if not exists payments_restaurant_idx on public.payments (restaurant_id);
create index if not exists payments_session_idx on public.payments (session_id);
create index if not exists payments_bill_idx on public.payments (bill_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at);
create index if not exists payments_restaurant_paid_at_idx on public.payments (restaurant_id, paid_at);
create index if not exists payments_method_idx on public.payments (restaurant_id, payment_method);

-- ---------------------------------------------------------------------------
-- 14. helper functions
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_restaurant_owner(p_restaurant_id uuid)
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
  );
$$;

create or replace function public.current_waiter_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select w.id
  from public.waiters w
  where w.auth_user_id = auth.uid()
  limit 1;
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
  limit 1;
$$;

create or replace function public.waiter_assigned_to_table(p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.waiter_table_assignments a
    join public.waiters w on w.id = a.waiter_id
    where w.auth_user_id = auth.uid()
      and w.is_active = true
      and a.table_id = p_table_id
  );
$$;

create or replace function public.waiter_can_access_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.table_sessions ts
    join public.waiters w
      on w.auth_user_id = auth.uid()
     and w.is_active = true
     and w.restaurant_id = ts.restaurant_id
    where ts.id = p_session_id
      and (
        (
          ts.primary_table_id is not null
          and exists (
            select 1
            from public.waiter_table_assignments a
            where a.waiter_id = w.id
              and a.table_id = ts.primary_table_id
          )
        )
        or exists (
          select 1
          from public.session_tables st
          join public.waiter_table_assignments a
            on a.table_id = st.table_id
           and a.waiter_id = w.id
          where st.session_id = ts.id
        )
      )
  );
$$;

create or replace function public.session_is_open(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('active', 'bill_requested', 'payment_pending');
$$;

-- ---------------------------------------------------------------------------
-- 15. cross-restaurant integrity + one open session per table
-- ---------------------------------------------------------------------------

create or replace function public.enforce_assignment_restaurant()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.waiters w
    where w.id = new.waiter_id
      and w.restaurant_id = new.restaurant_id
  ) then
    raise exception 'Waiter does not belong to this restaurant';
  end if;

  if not exists (
    select 1
    from public.restaurant_tables t
    where t.id = new.table_id
      and t.restaurant_id = new.restaurant_id
  ) then
    raise exception 'Table does not belong to this restaurant';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_session_restaurant()
returns trigger
language plpgsql
as $$
begin
  if new.primary_table_id is not null and not exists (
    select 1
    from public.restaurant_tables t
    where t.id = new.primary_table_id
      and t.restaurant_id = new.restaurant_id
  ) then
    raise exception 'Primary table does not belong to this restaurant';
  end if;

  if new.status in ('closed', 'cancelled') and new.closed_at is null then
    new.closed_at = now();
  end if;

  if new.status not in ('closed', 'cancelled') then
    new.closed_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_session_table_restaurant()
returns trigger
language plpgsql
as $$
declare
  v_restaurant_id uuid;
begin
  select ts.restaurant_id
  into v_restaurant_id
  from public.table_sessions ts
  where ts.id = new.session_id;

  if v_restaurant_id is null then
    raise exception 'Session not found';
  end if;

  if not exists (
    select 1
    from public.restaurant_tables t
    where t.id = new.table_id
      and t.restaurant_id = v_restaurant_id
  ) then
    raise exception 'Session table does not belong to this restaurant';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_order_restaurant()
returns trigger
language plpgsql
as $$
declare
  v_session_restaurant uuid;
begin
  select ts.restaurant_id
  into v_session_restaurant
  from public.table_sessions ts
  where ts.id = new.session_id;

  if v_session_restaurant is null or v_session_restaurant <> new.restaurant_id then
    raise exception 'Order session does not belong to this restaurant';
  end if;

  if new.waiter_id is not null and not exists (
    select 1
    from public.waiters w
    where w.id = new.waiter_id
      and w.restaurant_id = new.restaurant_id
  ) then
    raise exception 'Order waiter does not belong to this restaurant';
  end if;

  if new.source_table_id is not null and not exists (
    select 1
    from public.restaurant_tables t
    where t.id = new.source_table_id
      and t.restaurant_id = new.restaurant_id
  ) then
    raise exception 'Order source table does not belong to this restaurant';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_kot_restaurant()
returns trigger
language plpgsql
as $$
declare
  v_order_restaurant uuid;
  v_order_session uuid;
  v_session_restaurant uuid;
begin
  select o.restaurant_id, o.session_id
  into v_order_restaurant, v_order_session
  from public.orders o
  where o.id = new.order_id;

  select ts.restaurant_id
  into v_session_restaurant
  from public.table_sessions ts
  where ts.id = new.session_id;

  if v_order_restaurant is null or v_order_restaurant <> new.restaurant_id then
    raise exception 'KOT order does not belong to this restaurant';
  end if;

  if v_order_session is null or v_order_session <> new.session_id then
    raise exception 'KOT session does not match the order session';
  end if;

  if v_session_restaurant is null or v_session_restaurant <> new.restaurant_id then
    raise exception 'KOT session does not belong to this restaurant';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_kot_item_order()
returns trigger
language plpgsql
as $$
declare
  v_kot_order uuid;
  v_item_order uuid;
begin
  select k.order_id into v_kot_order from public.kots k where k.id = new.kot_id;
  select oi.order_id into v_item_order from public.order_items oi where oi.id = new.order_item_id;

  if v_kot_order is null or v_item_order is null or v_kot_order <> v_item_order then
    raise exception 'KOT item does not belong to the same order as the KOT';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_bill_restaurant()
returns trigger
language plpgsql
as $$
declare
  v_session_restaurant uuid;
begin
  select ts.restaurant_id
  into v_session_restaurant
  from public.table_sessions ts
  where ts.id = new.session_id;

  if v_session_restaurant is null or v_session_restaurant <> new.restaurant_id then
    raise exception 'Bill session does not belong to this restaurant';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_payment_restaurant()
returns trigger
language plpgsql
as $$
declare
  v_bill_restaurant uuid;
  v_bill_session uuid;
  v_session_restaurant uuid;
begin
  select b.restaurant_id, b.session_id
  into v_bill_restaurant, v_bill_session
  from public.bills b
  where b.id = new.bill_id;

  select ts.restaurant_id
  into v_session_restaurant
  from public.table_sessions ts
  where ts.id = new.session_id;

  if v_bill_restaurant is null or v_bill_restaurant <> new.restaurant_id then
    raise exception 'Payment bill does not belong to this restaurant';
  end if;

  if v_bill_session is null or v_bill_session <> new.session_id then
    raise exception 'Payment session does not match the bill session';
  end if;

  if v_session_restaurant is null or v_session_restaurant <> new.restaurant_id then
    raise exception 'Payment session does not belong to this restaurant';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_one_open_session_per_table()
returns trigger
language plpgsql
as $$
declare
  v_table_id uuid;
  v_session_id uuid;
  v_status text;
begin
  if tg_table_name = 'table_sessions' then
    v_table_id := new.primary_table_id;
    v_session_id := new.id;
    v_status := new.status;
    if v_table_id is null or not public.session_is_open(v_status) then
      return new;
    end if;
  else
    v_table_id := new.table_id;
    v_session_id := new.session_id;
    select ts.status into v_status
    from public.table_sessions ts
    where ts.id = v_session_id;
    if v_status is null or not public.session_is_open(v_status) then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.table_sessions ts
    where ts.id <> v_session_id
      and public.session_is_open(ts.status)
      and (
        ts.primary_table_id = v_table_id
        or exists (
          select 1
          from public.session_tables st
          where st.session_id = ts.id
            and st.table_id = v_table_id
        )
      )
  ) then
    raise exception 'Table already has an open session';
  end if;

  return new;
end;
$$;

create or replace function public.sync_primary_session_table()
returns trigger
language plpgsql
as $$
begin
  if new.primary_table_id is null then
    return new;
  end if;

  insert into public.session_tables (session_id, table_id)
  values (new.id, new.primary_table_id)
  on conflict (session_id, table_id) do nothing;

  return new;
end;
$$;

drop trigger if exists waiters_set_updated_at on public.waiters;
create trigger waiters_set_updated_at
  before update on public.waiters
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

drop trigger if exists waiter_table_assignments_restaurant on public.waiter_table_assignments;
create trigger waiter_table_assignments_restaurant
  before insert or update on public.waiter_table_assignments
  for each row execute function public.enforce_assignment_restaurant();

drop trigger if exists table_sessions_restaurant on public.table_sessions;
create trigger table_sessions_restaurant
  before insert or update on public.table_sessions
  for each row execute function public.enforce_session_restaurant();

drop trigger if exists table_sessions_one_open on public.table_sessions;
create trigger table_sessions_one_open
  before insert or update on public.table_sessions
  for each row execute function public.enforce_one_open_session_per_table();

drop trigger if exists table_sessions_sync_primary on public.table_sessions;
create trigger table_sessions_sync_primary
  after insert or update of primary_table_id on public.table_sessions
  for each row execute function public.sync_primary_session_table();

drop trigger if exists session_tables_restaurant on public.session_tables;
create trigger session_tables_restaurant
  before insert or update on public.session_tables
  for each row execute function public.enforce_session_table_restaurant();

drop trigger if exists session_tables_one_open on public.session_tables;
create trigger session_tables_one_open
  before insert or update on public.session_tables
  for each row execute function public.enforce_one_open_session_per_table();

drop trigger if exists orders_restaurant on public.orders;
create trigger orders_restaurant
  before insert or update on public.orders
  for each row execute function public.enforce_order_restaurant();

drop trigger if exists kots_restaurant on public.kots;
create trigger kots_restaurant
  before insert or update on public.kots
  for each row execute function public.enforce_kot_restaurant();

drop trigger if exists kot_items_order_match on public.kot_items;
create trigger kot_items_order_match
  before insert or update on public.kot_items
  for each row execute function public.enforce_kot_item_order();

drop trigger if exists bills_restaurant on public.bills;
create trigger bills_restaurant
  before insert or update on public.bills
  for each row execute function public.enforce_bill_restaurant();

drop trigger if exists payments_restaurant on public.payments;
create trigger payments_restaurant
  before insert or update on public.payments
  for each row execute function public.enforce_payment_restaurant();

-- ---------------------------------------------------------------------------
-- 16. RLS
-- ---------------------------------------------------------------------------

alter table public.waiters enable row level security;
alter table public.waiter_table_assignments enable row level security;
alter table public.table_sessions enable row level security;
alter table public.session_tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.kots enable row level security;
alter table public.kot_items enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;

revoke all on function public.is_restaurant_owner(uuid) from public;
revoke all on function public.current_waiter_id() from public;
revoke all on function public.current_waiter_restaurant_id() from public;
revoke all on function public.waiter_assigned_to_table(uuid) from public;
revoke all on function public.waiter_can_access_session(uuid) from public;
revoke all on function public.session_is_open(text) from public;

grant execute on function public.is_restaurant_owner(uuid) to authenticated;
grant execute on function public.current_waiter_id() to authenticated;
grant execute on function public.current_waiter_restaurant_id() to authenticated;
grant execute on function public.waiter_assigned_to_table(uuid) to authenticated;
grant execute on function public.waiter_can_access_session(uuid) to authenticated;
grant execute on function public.session_is_open(text) to authenticated;

-- waiters
drop policy if exists "owners manage waiters" on public.waiters;
create policy "owners manage waiters"
  on public.waiters for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters read own waiter" on public.waiters;
create policy "waiters read own waiter"
  on public.waiters for select
  to authenticated
  using (auth_user_id = auth.uid());

-- waiter_table_assignments (waiters may read own rows only; no manage)
drop policy if exists "owners manage waiter_table_assignments" on public.waiter_table_assignments;
create policy "owners manage waiter_table_assignments"
  on public.waiter_table_assignments for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters read own assignments" on public.waiter_table_assignments;
create policy "waiters read own assignments"
  on public.waiter_table_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.waiters w
      where w.id = waiter_id and w.auth_user_id = auth.uid()
    )
  );

-- table_sessions
drop policy if exists "owners manage table_sessions" on public.table_sessions;
create policy "owners manage table_sessions"
  on public.table_sessions for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select assigned sessions" on public.table_sessions;
create policy "waiters select assigned sessions"
  on public.table_sessions for select
  to authenticated
  using (public.waiter_can_access_session(id));

drop policy if exists "waiters insert assigned sessions" on public.table_sessions;
create policy "waiters insert assigned sessions"
  on public.table_sessions for insert
  to authenticated
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and primary_table_id is not null
    and public.waiter_assigned_to_table(primary_table_id)
  );

drop policy if exists "waiters update assigned sessions" on public.table_sessions;
create policy "waiters update assigned sessions"
  on public.table_sessions for update
  to authenticated
  using (public.waiter_can_access_session(id))
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(id)
  );

-- session_tables
drop policy if exists "owners manage session_tables" on public.session_tables;
create policy "owners manage session_tables"
  on public.session_tables for all
  to authenticated
  using (
    exists (
      select 1
      from public.table_sessions ts
      join public.restaurants r on r.id = ts.restaurant_id
      where ts.id = session_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.table_sessions ts
      join public.restaurants r on r.id = ts.restaurant_id
      where ts.id = session_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select session_tables" on public.session_tables;
create policy "waiters select session_tables"
  on public.session_tables for select
  to authenticated
  using (public.waiter_can_access_session(session_id));

drop policy if exists "waiters insert session_tables" on public.session_tables;
create policy "waiters insert session_tables"
  on public.session_tables for insert
  to authenticated
  with check (
    public.waiter_can_access_session(session_id)
    and public.waiter_assigned_to_table(table_id)
  );

-- orders
drop policy if exists "owners manage orders" on public.orders;
create policy "owners manage orders"
  on public.orders for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select orders" on public.orders;
create policy "waiters select orders"
  on public.orders for select
  to authenticated
  using (public.waiter_can_access_session(session_id));

drop policy if exists "waiters insert orders" on public.orders;
create policy "waiters insert orders"
  on public.orders for insert
  to authenticated
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
    and (waiter_id is null or waiter_id = public.current_waiter_id())
    and (source_table_id is null or public.waiter_assigned_to_table(source_table_id))
  );

drop policy if exists "waiters update orders" on public.orders;
create policy "waiters update orders"
  on public.orders for update
  to authenticated
  using (public.waiter_can_access_session(session_id))
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
  );

-- order_items
drop policy if exists "owners manage order_items" on public.order_items;
create policy "owners manage order_items"
  on public.order_items for all
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = order_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = order_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select order_items" on public.order_items;
create policy "waiters select order_items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.waiter_can_access_session(o.session_id)
    )
  );

drop policy if exists "waiters insert order_items" on public.order_items;
create policy "waiters insert order_items"
  on public.order_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.waiter_can_access_session(o.session_id)
    )
  );

drop policy if exists "waiters update order_items" on public.order_items;
create policy "waiters update order_items"
  on public.order_items for update
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.waiter_can_access_session(o.session_id)
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.waiter_can_access_session(o.session_id)
    )
  );

-- kots
drop policy if exists "owners manage kots" on public.kots;
create policy "owners manage kots"
  on public.kots for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select kots" on public.kots;
create policy "waiters select kots"
  on public.kots for select
  to authenticated
  using (public.waiter_can_access_session(session_id));

drop policy if exists "waiters insert kots" on public.kots;
create policy "waiters insert kots"
  on public.kots for insert
  to authenticated
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
  );

drop policy if exists "waiters update kots" on public.kots;
create policy "waiters update kots"
  on public.kots for update
  to authenticated
  using (public.waiter_can_access_session(session_id))
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
  );

-- kot_items
drop policy if exists "owners manage kot_items" on public.kot_items;
create policy "owners manage kot_items"
  on public.kot_items for all
  to authenticated
  using (
    exists (
      select 1
      from public.kots k
      join public.restaurants r on r.id = k.restaurant_id
      where k.id = kot_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.kots k
      join public.restaurants r on r.id = k.restaurant_id
      where k.id = kot_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select kot_items" on public.kot_items;
create policy "waiters select kot_items"
  on public.kot_items for select
  to authenticated
  using (
    exists (
      select 1 from public.kots k
      where k.id = kot_id and public.waiter_can_access_session(k.session_id)
    )
  );

drop policy if exists "waiters insert kot_items" on public.kot_items;
create policy "waiters insert kot_items"
  on public.kot_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.kots k
      where k.id = kot_id and public.waiter_can_access_session(k.session_id)
    )
  );

drop policy if exists "waiters update kot_items" on public.kot_items;
create policy "waiters update kot_items"
  on public.kot_items for update
  to authenticated
  using (
    exists (
      select 1 from public.kots k
      where k.id = kot_id and public.waiter_can_access_session(k.session_id)
    )
  )
  with check (
    exists (
      select 1 from public.kots k
      where k.id = kot_id and public.waiter_can_access_session(k.session_id)
    )
  );

-- bills
drop policy if exists "owners manage bills" on public.bills;
create policy "owners manage bills"
  on public.bills for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select bills" on public.bills;
create policy "waiters select bills"
  on public.bills for select
  to authenticated
  using (public.waiter_can_access_session(session_id));

drop policy if exists "waiters insert bills" on public.bills;
create policy "waiters insert bills"
  on public.bills for insert
  to authenticated
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
  );

drop policy if exists "waiters update bills" on public.bills;
create policy "waiters update bills"
  on public.bills for update
  to authenticated
  using (public.waiter_can_access_session(session_id))
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
  );

-- payments
drop policy if exists "owners manage payments" on public.payments;
create policy "owners manage payments"
  on public.payments for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "waiters select payments" on public.payments;
create policy "waiters select payments"
  on public.payments for select
  to authenticated
  using (public.waiter_can_access_session(session_id));

drop policy if exists "waiters insert payments" on public.payments;
create policy "waiters insert payments"
  on public.payments for insert
  to authenticated
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
  );

drop policy if exists "waiters update payments" on public.payments;
create policy "waiters update payments"
  on public.payments for update
  to authenticated
  using (public.waiter_can_access_session(session_id))
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and public.waiter_can_access_session(session_id)
  );
