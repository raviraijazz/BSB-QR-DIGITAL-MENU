-- BSB Digital Menu — Phase 27: Founder Console global platform settings.
-- Additive. Safe to re-run. Does not drop tables or restaurant/order/bill rows.
--
-- Run AFTER supabase/founder-console.sql and supabase/session-management.sql.
-- Does not replace restaurant_settings, subscription default-plan settings, or
-- Phase 26 session policies.
--
-- Enforcement:
--   * platform_public_settings() is the anon/authenticated read model (no secrets).
--   * platform_get_settings / platform_set_settings are founder-only.
--   * New owner profile inserts require platform_registration_ok().
--   * Maintenance blocks owner/waiter privileged helpers; Founder Console and
--     guest QR public-read policies stay available.
--   * Existing owner/waiter login is not disabled by closing registrations.

-- ---------------------------------------------------------------------------
-- 1. Singleton settings row
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  display_name text not null default 'BSB Digital Menu',
  tagline text not null default 'Simple digital menus for modern restaurants.',
  support_email text not null default 'bsbagency4u@gmail.com',
  support_phone text not null default '+91 97214 50099',
  support_whatsapp text not null default '919721450099',
  support_hours text not null default '',
  registration_enabled boolean not null default true,
  registration_message text not null default '',
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint platform_settings_display_name_len check (char_length(btrim(display_name)) between 2 and 80),
  constraint platform_settings_tagline_len check (char_length(tagline) <= 160),
  constraint platform_settings_email_len check (char_length(btrim(support_email)) between 5 and 120),
  constraint platform_settings_phone_len check (char_length(support_phone) <= 32),
  constraint platform_settings_whatsapp_len check (char_length(support_whatsapp) <= 20),
  constraint platform_settings_hours_len check (char_length(support_hours) <= 120),
  constraint platform_settings_registration_message_len check (char_length(registration_message) <= 280),
  constraint platform_settings_maintenance_message_len check (char_length(maintenance_message) <= 500)
);

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;

drop policy if exists "no direct platform settings access" on public.platform_settings;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.platform_settings_row()
returns public.platform_settings
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.platform_settings s
  where s.id = 1;
$$;

create or replace function public.platform_registration_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.registration_enabled from public.platform_settings s where s.id = 1),
    true
  );
$$;

create or replace function public.platform_maintenance_blocks_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.maintenance_enabled from public.platform_settings s where s.id = 1),
    false
  ) and not exists (
    select 1
    from public.platform_admins a
    where a.user_id = auth.uid()
      and coalesce(a.must_change_password, false) = false
  );
$$;

create or replace function public.platform_public_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.platform_settings;
begin
  select * into v_row from public.platform_settings where id = 1;
  if not found then
    return jsonb_build_object(
      'display_name', 'BSB Digital Menu',
      'tagline', 'Simple digital menus for modern restaurants.',
      'support_email', 'bsbagency4u@gmail.com',
      'support_phone', '+91 97214 50099',
      'support_whatsapp', '919721450099',
      'support_hours', '',
      'registration_enabled', true,
      'registration_message', '',
      'maintenance_enabled', false,
      'maintenance_message', ''
    );
  end if;
  return jsonb_build_object(
    'display_name', v_row.display_name,
    'tagline', v_row.tagline,
    'support_email', v_row.support_email,
    'support_phone', v_row.support_phone,
    'support_whatsapp', v_row.support_whatsapp,
    'support_hours', v_row.support_hours,
    'registration_enabled', v_row.registration_enabled,
    'registration_message', v_row.registration_message,
    'maintenance_enabled', v_row.maintenance_enabled,
    'maintenance_message', v_row.maintenance_message
  );
end;
$$;

create or replace function public.platform_settings_payload(p_row public.platform_settings)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_username text := '';
begin
  if p_row.updated_by is not null then
    select coalesce(a.username, '')
      into v_username
    from public.platform_admins a
    where a.user_id = p_row.updated_by;
    if v_username is null then
      v_username := '';
    end if;
  end if;
  return jsonb_build_object(
    'display_name', p_row.display_name,
    'tagline', p_row.tagline,
    'support_email', p_row.support_email,
    'support_phone', p_row.support_phone,
    'support_whatsapp', p_row.support_whatsapp,
    'support_hours', p_row.support_hours,
    'registration_enabled', p_row.registration_enabled,
    'registration_message', p_row.registration_message,
    'maintenance_enabled', p_row.maintenance_enabled,
    'maintenance_message', p_row.maintenance_message,
    'updated_at', p_row.updated_at,
    'updated_by', p_row.updated_by,
    'updated_by_username', coalesce(v_username, '')
  );
end;
$$;

create or replace function public.platform_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.platform_settings;
begin
  perform public.platform_require_admin();
  select * into v_row from public.platform_settings where id = 1;
  if not found then
    raise exception 'Platform settings are not initialized' using errcode = 'P0002';
  end if;
  return public.platform_settings_payload(v_row);
end;
$$;

create or replace function public.platform_set_settings(p_settings jsonb, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.platform_settings;
  v_after public.platform_settings;
  v_name text;
  v_tagline text;
  v_email text;
  v_phone text;
  v_whatsapp text;
  v_hours text;
  v_reg_message text;
  v_maint_message text;
  v_registration boolean;
  v_maintenance boolean;
begin
  perform public.platform_require_admin();
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Platform settings are required' using errcode = '22023';
  end if;

  select * into v_before from public.platform_settings where id = 1;
  if not found then
    insert into public.platform_settings (id) values (1);
    select * into v_before from public.platform_settings where id = 1;
  end if;

  v_name := btrim(coalesce(p_settings ->> 'display_name', v_before.display_name));
  v_tagline := coalesce(p_settings ->> 'tagline', v_before.tagline);
  v_email := lower(btrim(coalesce(p_settings ->> 'support_email', v_before.support_email)));
  v_phone := btrim(coalesce(p_settings ->> 'support_phone', v_before.support_phone));
  v_whatsapp := regexp_replace(coalesce(p_settings ->> 'support_whatsapp', v_before.support_whatsapp), '[^0-9]', '', 'g');
  v_hours := btrim(coalesce(p_settings ->> 'support_hours', v_before.support_hours));
  v_reg_message := btrim(coalesce(p_settings ->> 'registration_message', v_before.registration_message));
  v_maint_message := btrim(coalesce(p_settings ->> 'maintenance_message', v_before.maintenance_message));
  v_registration := coalesce((p_settings ->> 'registration_enabled')::boolean, v_before.registration_enabled);
  v_maintenance := coalesce((p_settings ->> 'maintenance_enabled')::boolean, v_before.maintenance_enabled);

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Platform name must be between 2 and 80 characters' using errcode = '22023';
  end if;
  if char_length(v_tagline) > 160 then
    raise exception 'Tagline must be 160 characters or fewer' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid support email' using errcode = '22023';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 32 then
    raise exception 'Enter a valid support phone number' using errcode = '22023';
  end if;
  if char_length(v_whatsapp) < 10 or char_length(v_whatsapp) > 15 then
    raise exception 'WhatsApp number must be 10 to 15 digits' using errcode = '22023';
  end if;
  if char_length(v_hours) > 120 then
    raise exception 'Support hours must be 120 characters or fewer' using errcode = '22023';
  end if;
  if char_length(v_reg_message) > 280 then
    raise exception 'Registration message must be 280 characters or fewer' using errcode = '22023';
  end if;
  if char_length(v_maint_message) > 500 then
    raise exception 'Maintenance message must be 500 characters or fewer' using errcode = '22023';
  end if;

  update public.platform_settings
    set display_name = v_name,
        tagline = v_tagline,
        support_email = v_email,
        support_phone = v_phone,
        support_whatsapp = v_whatsapp,
        support_hours = v_hours,
        registration_enabled = v_registration,
        registration_message = v_reg_message,
        maintenance_enabled = v_maintenance,
        maintenance_message = v_maint_message,
        updated_at = now(),
        updated_by = auth.uid()
    where id = 1
    returning * into v_after;

  perform public.platform_audit(
    'platform_settings_update',
    null,
    null,
    coalesce(nullif(btrim(p_reason), ''), ''),
    jsonb_build_object(
      'before', jsonb_build_object(
        'display_name', v_before.display_name,
        'tagline', v_before.tagline,
        'support_email', v_before.support_email,
        'support_phone', v_before.support_phone,
        'support_whatsapp', v_before.support_whatsapp,
        'support_hours', v_before.support_hours,
        'registration_enabled', v_before.registration_enabled,
        'registration_message', v_before.registration_message,
        'maintenance_enabled', v_before.maintenance_enabled,
        'maintenance_message', v_before.maintenance_message
      ),
      'after', jsonb_build_object(
        'display_name', v_after.display_name,
        'tagline', v_after.tagline,
        'support_email', v_after.support_email,
        'support_phone', v_after.support_phone,
        'support_whatsapp', v_after.support_whatsapp,
        'support_hours', v_after.support_hours,
        'registration_enabled', v_after.registration_enabled,
        'registration_message', v_after.registration_message,
        'maintenance_enabled', v_after.maintenance_enabled,
        'maintenance_message', v_after.maintenance_message
      )
    )
  );

  return public.platform_settings_payload(v_after);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Preserve Phase 26 session checks and add maintenance/registration gates
-- ---------------------------------------------------------------------------
create or replace function public.is_restaurant_staff_owner(p_restaurant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.platform_session_ok() then
    return false;
  end if;
  if public.platform_maintenance_blocks_staff() then
    return false;
  end if;
  return exists (
    select 1
    from public.restaurants r
    where r.id = p_restaurant_id
      and r.user_id = auth.uid()
      and public.account_not_blocked(r.user_id)
      and public.restaurant_access_ok(r.id)
  );
end;
$$;

create or replace function public.current_waiter_restaurant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.platform_session_ok() then
    return null;
  end if;
  if public.platform_maintenance_blocks_staff() then
    return null;
  end if;
  return (
    select w.restaurant_id
    from public.waiters w
    where w.auth_user_id = auth.uid()
      and w.is_active = true
      and w.is_blocked = false
      and public.restaurant_access_ok(w.restaurant_id)
    limit 1
  );
end;
$$;

drop policy if exists "owners insert own profile" on public.profiles;
create policy "owners insert own profile"
  on public.profiles for insert
  to authenticated
  with check (
    auth.uid() = id
    and (
      role is distinct from 'owner'
      or public.platform_registration_ok()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.platform_settings_row() from public, anon;
revoke all on function public.platform_registration_ok() from public, anon;
revoke all on function public.platform_maintenance_blocks_staff() from public, anon;
revoke all on function public.platform_public_settings() from public;
revoke all on function public.platform_settings_payload(public.platform_settings) from public, anon, authenticated;
revoke all on function public.platform_get_settings() from public, anon;
revoke all on function public.platform_set_settings(jsonb, text) from public, anon;

grant execute on function public.platform_registration_ok() to authenticated;
grant execute on function public.platform_maintenance_blocks_staff() to authenticated;
grant execute on function public.platform_public_settings() to anon, authenticated;
grant execute on function public.platform_get_settings() to authenticated;
grant execute on function public.platform_set_settings(jsonb, text) to authenticated;
