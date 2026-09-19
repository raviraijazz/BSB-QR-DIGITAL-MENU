-- BSB Digital Menu — pricing variants (run once). Keeps existing menu_items.price.

alter table public.menu_items
  add column if not exists variants jsonb not null default '[]'::jsonb;
