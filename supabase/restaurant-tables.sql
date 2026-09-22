-- Table-wise QR codes. Safe to run on existing projects.
-- Does not change restaurants, menus, slugs, or the public /menu/:slug URL.

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  qr_token text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists restaurant_tables_qr_token_idx
  on public.restaurant_tables (qr_token);

create index if not exists restaurant_tables_restaurant_idx
  on public.restaurant_tables (restaurant_id, sort_order);

alter table public.restaurant_tables enable row level security;

drop policy if exists "owners manage restaurant_tables" on public.restaurant_tables;
create policy "owners manage restaurant_tables"
  on public.restaurant_tables for all
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

drop policy if exists "public read restaurant_tables" on public.restaurant_tables;
create policy "public read restaurant_tables"
  on public.restaurant_tables for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.slug is not null
    )
  );
