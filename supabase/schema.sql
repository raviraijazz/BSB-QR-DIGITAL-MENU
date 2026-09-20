-- BSB Digital Menu — run this in Supabase SQL Editor (once)

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text default '',
  address text default '',
  logo_url text,
  slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null,
  description text default '',
  price numeric(10, 2) not null default 0,
  variants jsonb not null default '[]'::jsonb,
  image_url text,
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists restaurants_slug_idx on public.restaurants (slug);
create index if not exists restaurants_user_id_idx on public.restaurants (user_id);
create index if not exists categories_restaurant_idx on public.categories (restaurant_id, sort_order);
create index if not exists menu_items_restaurant_idx on public.menu_items (restaurant_id, category_id, sort_order);

alter table public.restaurants enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;

drop policy if exists "owners manage restaurants" on public.restaurants;
create policy "owners manage restaurants"
  on public.restaurants for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "public read restaurants" on public.restaurants;
create policy "public read restaurants"
  on public.restaurants for select
  to anon, authenticated
  using (slug is not null);

drop policy if exists "owners manage categories" on public.categories;
create policy "owners manage categories"
  on public.categories for all
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

drop policy if exists "public read categories" on public.categories;
create policy "public read categories"
  on public.categories for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.slug is not null
    )
  );

drop policy if exists "owners manage menu_items" on public.menu_items;
create policy "owners manage menu_items"
  on public.menu_items for all
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

drop policy if exists "public read menu_items" on public.menu_items;
create policy "public read menu_items"
  on public.menu_items for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.slug is not null
    )
  );

insert into storage.buckets (id, name, public)
values ('menu-assets', 'menu-assets', true)
on conflict (id) do nothing;

drop policy if exists "public read menu-assets" on storage.objects;
create policy "public read menu-assets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-assets');

drop policy if exists "owners upload menu-assets" on storage.objects;
create policy "owners upload menu-assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owners update menu-assets" on storage.objects;
create policy "owners update menu-assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menu-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owners delete menu-assets" on storage.objects;
create policy "owners delete menu-assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
