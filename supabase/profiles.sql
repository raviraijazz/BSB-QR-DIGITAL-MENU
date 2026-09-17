-- BSB Digital Menu — unique usernames (run once). Does not change restaurants/categories/menu_items.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

alter table public.profiles enable row level security;

drop policy if exists "owners read own profile" on public.profiles;
create policy "owners read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "owners insert own profile" on public.profiles;
create policy "owners insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where username = lower(trim(p_username))
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
