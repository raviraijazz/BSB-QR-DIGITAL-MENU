-- BSB Digital Menu — idempotent Founder Console menu import.
-- Additive. Safe to re-run. Does not drop tables or delete menu/order rows.
--
-- Run AFTER supabase/founder-console.sql.
--
-- Root cause this repairs:
--   public.platform_import_menu always INSERTed a new menu_items row.
--   Variants live in menu_items.variants jsonb (there is no variants table).
--   Repeating Import Menu therefore created duplicate parent items and
--   duplicated Quarter/Half/Full entries. Success feedback also omitted
--   variant/conflict counts.
--
-- This replacement:
--   * Matches an existing parent by restaurant + category + lower(btrim(name)).
--   * Adds only missing named variants. Equal prices are skipped.
--   * Reports price conflicts and never overwrites existing prices.
--   * Uses an advisory transaction lock so concurrent imports of the same
--     restaurant cannot insert duplicates.
--   * Never deletes items, variants, categories, or historical orders.
--
-- Unique indexes are NOT added here: legacy duplicates from earlier imports
-- would make them fail. A diagnostic query is included at the end.

create or replace function public.platform_import_variant_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(btrim(coalesce(p_name, '')));
begin
  v := btrim(regexp_replace(v, '\s*\((inr|rs|₹)\)\s*$', ''));
  if v = '' or v in ('price', 'variant price', 'unit price', 'amount', 'rate', 'mrp', 'cost', 'notes', 'note', 'variant name') then
    return '';
  end if;
  if v in ('quarter', 'qtr', '1/4', '1/4th') or v like 'quarter %' or v like 'quarter(%' or v like 'qtr %' then
    return 'Quarter';
  end if;
  if v in ('half', '1/2', '1/2th') or v like 'half %' or v like 'half(%' then
    return 'Half';
  end if;
  if v in ('full') or v like 'full %' or v like 'full(%' then
    return 'Full';
  end if;
  if v in ('small', 'sm') or v like 'small %' then
    return 'Small';
  end if;
  if v in ('medium', 'med') or v like 'medium %' then
    return 'Medium';
  end if;
  if v in ('large', 'lg') or v like 'large %' then
    return 'Large';
  end if;
  return btrim(coalesce(p_name, ''));
end;
$$;

revoke all on function public.platform_import_variant_name(text) from public, anon;

create or replace function public.platform_import_menu(
  p_restaurant_id uuid,
  p_rows jsonb,
  p_request_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_categories int := 0;
  v_created_items int := 0;
  v_created_variants int := 0;
  v_skipped_items int := 0;
  v_skipped_variants int := 0;
  v_failed_rows int := 0;
  v_conflicts int := 0;
  v_conflict_samples jsonb := '[]'::jsonb;
  v_row jsonb;
  v_cat_name text;
  v_cat_id uuid;
  v_name text;
  v_price numeric;
  v_sort int := 0;
  v_food text;
  v_incoming jsonb;
  v_existing public.menu_items;
  v_existing_variants jsonb;
  v_next_variants jsonb;
  v_variant jsonb;
  v_variant_name text;
  v_variant_price numeric;
  v_match jsonb;
  v_existing_price numeric;
  v_has_named boolean;
  v_item_id uuid;
  v_restaurant_name text;
  v_request_id text;
begin
  perform public.platform_require_admin();

  select name into v_restaurant_name from public.restaurants where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('menu-import:' || p_restaurant_id::text));

  v_request_id := left(btrim(coalesce(p_request_id, '')), 80);

  select coalesce(max(sort_order), -1) + 1 into v_sort
  from public.menu_items
  where restaurant_id = p_restaurant_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_cat_id := null;
    v_cat_name := btrim(coalesce(v_row->>'category', ''));
    v_name := btrim(coalesce(v_row->>'name', ''));
    begin
      v_price := coalesce((v_row->>'price')::numeric, -1);
    exception when others then
      v_price := -1;
    end;

    if v_cat_name = '' or v_name = '' or v_price < 0 then
      v_failed_rows := v_failed_rows + 1;
      continue;
    end if;

    v_incoming := case
      when jsonb_typeof(v_row->'variants') = 'array' then v_row->'variants'
      else '[]'::jsonb
    end;

    select id into v_cat_id
    from public.categories
    where restaurant_id = p_restaurant_id
      and lower(btrim(name)) = lower(v_cat_name)
    order by created_at
    limit 1;

    if v_cat_id is null then
      insert into public.categories (restaurant_id, name, sort_order)
      values (p_restaurant_id, v_cat_name, v_created_categories)
      returning id into v_cat_id;
      v_created_categories := v_created_categories + 1;
    end if;

    v_food := case
      when coalesce(v_row->>'food_type', '') in ('non_veg', 'non-veg', 'nonveg') then 'non_veg'
      else 'veg'
    end;

    select * into v_existing
    from public.menu_items
    where restaurant_id = p_restaurant_id
      and category_id = v_cat_id
      and lower(btrim(name)) = lower(v_name)
    order by created_at
    limit 1;

    if not found then
      insert into public.menu_items (
        restaurant_id, category_id, name, description, price, variants,
        image_url, is_available, food_type, sort_order
      ) values (
        p_restaurant_id,
        v_cat_id,
        v_name,
        coalesce(v_row->>'description', ''),
        v_price,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', public.platform_import_variant_name(v.value->>'name'),
            'price', (v.value->>'price')::numeric,
            'is_available', coalesce((v.value->>'is_available')::boolean, true)
          ))
          from jsonb_array_elements(v_incoming) v
          where public.platform_import_variant_name(v.value->>'name') <> ''
            and (v.value->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
        ), '[]'::jsonb),
        nullif(v_row->>'image_url', ''),
        coalesce((v_row->>'is_available')::boolean, true),
        v_food,
        v_sort
      )
      returning id into v_item_id;
      v_sort := v_sort + 1;
      v_created_items := v_created_items + 1;
      v_created_variants := v_created_variants + coalesce((
        select count(*)::int
        from jsonb_array_elements(v_incoming) v
        where public.platform_import_variant_name(v.value->>'name') <> ''
          and (v.value->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
      ), 0);
      continue;
    end if;

    v_skipped_items := v_skipped_items + 1;
    v_existing_variants := case
      when jsonb_typeof(v_existing.variants) = 'array' then v_existing.variants
      else '[]'::jsonb
    end;
    v_next_variants := v_existing_variants;
    v_has_named := exists (
      select 1
      from jsonb_array_elements(v_existing_variants) e
      where btrim(coalesce(e->>'name', '')) <> ''
    );

    for v_variant in select * from jsonb_array_elements(v_incoming)
    loop
      v_variant_name := public.platform_import_variant_name(v_variant->>'name');
      if v_variant_name = '' then
        continue;
      end if;
      begin
        v_variant_price := (v_variant->>'price')::numeric;
      exception when others then
        v_failed_rows := v_failed_rows + 1;
        continue;
      end;
      if v_variant_price is null or v_variant_price < 0 then
        v_failed_rows := v_failed_rows + 1;
        continue;
      end if;

      v_match := null;
      select e
      into v_match
      from jsonb_array_elements(v_next_variants) e
      where public.platform_import_variant_name(e->>'name') = v_variant_name
      limit 1;

      if v_match is null then
        v_next_variants := v_next_variants || jsonb_build_array(jsonb_build_object(
          'name', v_variant_name,
          'price', v_variant_price,
          'is_available', coalesce((v_variant->>'is_available')::boolean, true)
        ));
        v_created_variants := v_created_variants + 1;
      else
        begin
          v_existing_price := (v_match->>'price')::numeric;
        exception when others then
          v_existing_price := null;
        end;
        if v_existing_price is not distinct from v_variant_price then
          v_skipped_variants := v_skipped_variants + 1;
        else
          v_conflicts := v_conflicts + 1;
          if jsonb_array_length(v_conflict_samples) < 20 then
            v_conflict_samples := v_conflict_samples || jsonb_build_array(jsonb_build_object(
              'item', v_name,
              'variant', v_variant_name,
              'existing', v_existing_price,
              'incoming', v_variant_price
            ));
          end if;
        end if;
      end if;
    end loop;

    if jsonb_array_length(v_incoming) = 0 and not v_has_named then
      if v_existing.price is distinct from v_price then
        v_conflicts := v_conflicts + 1;
        if jsonb_array_length(v_conflict_samples) < 20 then
          v_conflict_samples := v_conflict_samples || jsonb_build_array(jsonb_build_object(
            'item', v_name,
            'variant', '',
            'existing', v_existing.price,
            'incoming', v_price
          ));
        end if;
      end if;
    end if;

    if v_next_variants is distinct from v_existing_variants then
      update public.menu_items
        set variants = v_next_variants
      where id = v_existing.id
        and restaurant_id = p_restaurant_id;
    end if;
  end loop;

  perform public.platform_audit(
    'menu_import',
    p_restaurant_id,
    null,
    '',
    jsonb_build_object(
      'request_id', v_request_id,
      'created_items', v_created_items,
      'created_categories', v_created_categories,
      'created_variants', v_created_variants,
      'skipped_items', v_skipped_items,
      'skipped_variants', v_skipped_variants,
      'skipped', v_skipped_items + v_failed_rows,
      'conflicts', v_conflicts,
      'failed_rows', v_failed_rows
    )
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'restaurant_name', coalesce(v_restaurant_name, ''),
    'request_id', v_request_id,
    'created_items', v_created_items,
    'created_categories', v_created_categories,
    'created_variants', v_created_variants,
    'skipped_items', v_skipped_items,
    'skipped_variants', v_skipped_variants,
    'skipped', v_skipped_items + v_failed_rows,
    'conflicts', v_conflicts,
    'failed_rows', v_failed_rows,
    'conflict_samples', v_conflict_samples,
    'no_changes', (v_created_items = 0 and v_created_variants = 0 and v_created_categories = 0 and v_conflicts = 0),
    'completed_at', now()
  );
end;
$$;

-- Drop the previous two-argument signature so two-arg calls use the default
-- p_request_id rather than becoming ambiguous with the three-arg version.
drop function if exists public.platform_import_menu(uuid, jsonb);

revoke all on function public.platform_import_menu(uuid, jsonb, text) from public, anon;
grant execute on function public.platform_import_menu(uuid, jsonb, text) to authenticated;

-- Diagnostic only. Does not delete. Review before any cleanup.
-- Duplicate parent items created by earlier always-insert imports:
--
-- select r.name as restaurant, c.name as category, m.name as item, count(*) as copies
-- from public.menu_items m
-- join public.categories c on c.id = m.category_id
-- join public.restaurants r on r.id = m.restaurant_id
-- group by r.name, c.name, lower(btrim(m.name))
-- having count(*) > 1
-- order by copies desc, r.name, c.name, m.name;
--
-- Duplicate named variants inside one item:
--
-- select r.name as restaurant, m.name as item, lower(btrim(v->>'name')) as variant, count(*) as copies
-- from public.menu_items m
-- join public.restaurants r on r.id = m.restaurant_id
-- cross join lateral jsonb_array_elements(coalesce(m.variants, '[]'::jsonb)) v
-- where btrim(coalesce(v->>'name', '')) <> ''
-- group by r.name, m.id, m.name, lower(btrim(v->>'name'))
-- having count(*) > 1
-- order by copies desc, r.name, m.name;
--
-- Fake generic labels created when "Variant Price (INR)" was treated as a size:
--
-- select r.name as restaurant, m.name as item, v->>'name' as variant, v->>'price' as price
-- from public.menu_items m
-- join public.restaurants r on r.id = m.restaurant_id
-- cross join lateral jsonb_array_elements(coalesce(m.variants, '[]'::jsonb)) v
-- where public.platform_import_variant_name(v->>'name') = ''
--    or lower(btrim(v->>'name')) like 'variant price%'
-- order by r.name, m.name;
