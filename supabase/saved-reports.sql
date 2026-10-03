-- BSB Digital Menu — Phase 13.1 saved report configurations (additive).
-- Restaurant-scoped JSON view state only. Does not change bills, payments,
-- orders, sessions, KOTs, or waiter auth. Owner-only. Waiters have no access.

create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  report_type text not null default 'collections',
  is_favorite boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_reports_name_not_blank check (btrim(name) <> ''),
  constraint saved_reports_name_len check (char_length(name) <= 80),
  constraint saved_reports_type_check check (
    report_type in (
      'collections',
      'sales',
      'payments',
      'waiters',
      'tables',
      'items',
      'discounts',
      'kitchen',
      'outstanding'
    )
  )
);

create unique index if not exists saved_reports_restaurant_name_key
  on public.saved_reports (restaurant_id, lower(btrim(name)));

create index if not exists saved_reports_restaurant_idx
  on public.saved_reports (restaurant_id, updated_at desc);

drop trigger if exists saved_reports_set_updated_at on public.saved_reports;
create trigger saved_reports_set_updated_at
  before update on public.saved_reports
  for each row execute function public.set_updated_at();

alter table public.saved_reports enable row level security;

drop policy if exists "owners manage saved reports" on public.saved_reports;
create policy "owners manage saved reports"
  on public.saved_reports for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));
