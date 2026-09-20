-- Veg / Non-Veg food type for menu items.
-- Safe to run on existing projects. Does not change prices, images, or availability.

alter table public.menu_items
  add column if not exists food_type text not null default 'veg';

update public.menu_items
set food_type = 'veg'
where food_type is null or food_type not in ('veg', 'non_veg');

alter table public.menu_items
  drop constraint if exists menu_items_food_type_check;

alter table public.menu_items
  add constraint menu_items_food_type_check
  check (food_type in ('veg', 'non_veg'));
