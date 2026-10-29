-- READ ONLY. Safe to run. Does not insert, update, or delete anything.
-- Paste into Supabase SQL Editor after menu-import-idempotent.sql.
-- Review results before any cleanup. Do not delete rows that order/KOT/bill
-- snapshots may still display.

-- 1. Duplicate parent items in one restaurant + category.
select r.name as restaurant,
       c.name as category,
       m.name as item,
       count(*) as copies,
       array_agg(m.id order by m.created_at) as menu_item_ids
from public.menu_items m
join public.categories c on c.id = m.category_id
join public.restaurants r on r.id = m.restaurant_id
group by r.name, c.name, lower(btrim(m.name))
having count(*) > 1
order by copies desc, r.name, c.name, m.name;

-- 2. Duplicate variants on one parent, grouped by canonical label.
--    "Quarter Price (INR)" and "Quarter" count as the same variant.
select r.name as restaurant,
       m.id as menu_item_id,
       m.name as item,
       public.platform_import_variant_name(v->>'name') as canonical_variant,
       count(*) as copies,
       jsonb_agg(jsonb_build_object(
         'stored_name', v->>'name',
         'price', v->>'price'
       ) order by v->>'name') as stored
from public.menu_items m
join public.restaurants r on r.id = m.restaurant_id
cross join lateral jsonb_array_elements(coalesce(m.variants, '[]'::jsonb)) v
where public.platform_import_variant_name(v->>'name') <> ''
group by r.name, m.id, m.name, public.platform_import_variant_name(v->>'name')
having count(*) > 1
order by copies desc, r.name, m.name;

-- 3. Variant totals per restaurant vs parent count.
select r.name as restaurant,
       count(distinct m.id) as parent_items,
       coalesce(sum(jsonb_array_length(coalesce(m.variants, '[]'::jsonb))), 0) as stored_variant_slots
from public.menu_items m
join public.restaurants r on r.id = m.restaurant_id
group by r.name
order by stored_variant_slots desc, r.name;

-- 4. Fake generic labels from treating "Variant Price (INR)" as a size.
select r.name as restaurant,
       m.name as item,
       v->>'name' as variant,
       v->>'price' as price
from public.menu_items m
join public.restaurants r on r.id = m.restaurant_id
cross join lateral jsonb_array_elements(coalesce(m.variants, '[]'::jsonb)) v
where public.platform_import_variant_name(v->>'name') = ''
   or lower(btrim(v->>'name')) like 'variant price%'
order by r.name, m.name;

-- 5. Historical order lines whose snapshot name starts with the menu item.
--    order_items.item_name is copied text, not a foreign key. Informational only.
select r.name as restaurant,
       m.name as item,
       count(oi.id) as order_lines
from public.menu_items m
join public.restaurants r on r.id = m.restaurant_id
left join public.orders o on o.restaurant_id = m.restaurant_id
left join public.order_items oi
  on oi.order_id = o.id
 and oi.item_name ilike m.name || '%'
group by r.name, m.name
having count(oi.id) > 0
order by order_lines desc, r.name, m.name;
