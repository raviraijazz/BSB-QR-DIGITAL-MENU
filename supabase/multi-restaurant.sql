-- Allow one owner to have multiple restaurants.
-- Safe to run on existing projects. Does not delete or duplicate restaurants.

alter table public.restaurants
  drop constraint if exists restaurants_user_id_key;

drop index if exists public.restaurants_user_id_key;

create index if not exists restaurants_user_id_idx on public.restaurants (user_id);
