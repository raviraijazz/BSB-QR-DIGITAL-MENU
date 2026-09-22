-- Additive fields for table-wise QR. Safe on existing restaurant_tables.
-- Does not drop or recreate the table. Does not change qr_token values.

alter table public.restaurant_tables
  add column if not exists table_number text;

alter table public.restaurant_tables
  add column if not exists is_active boolean not null default true;

update public.restaurant_tables
set table_number = coalesce(nullif(btrim(table_number), ''), nullif(btrim(name), ''), (sort_order + 1)::text)
where table_number is null or btrim(table_number) = '';

with ranked as (
  select
    id,
    row_number() over (partition by restaurant_id, lower(table_number) order by created_at, id) as rn
  from public.restaurant_tables
)
update public.restaurant_tables t
set table_number = t.table_number || '-' || substring(t.id::text, 1, 4)
from ranked r
where t.id = r.id and r.rn > 1;

alter table public.restaurant_tables
  alter column table_number set default '';

alter table public.restaurant_tables
  alter column table_number set not null;

create unique index if not exists restaurant_tables_restaurant_number_idx
  on public.restaurant_tables (restaurant_id, lower(table_number))
  where btrim(table_number) <> '';
