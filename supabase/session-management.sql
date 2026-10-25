-- BSB Digital Menu — Phase 26: Session management & auto logout
-- Run AFTER supabase/founder-console.sql (and founder-password-gate.sql).
-- Additive only. Does not sign out existing users, drop data, or weaken RLS.
--
-- Enforcement:
--   * platform_session_ok() is the server source of truth for idle expiry,
--     absolute lifetime, and founder revocation.
--   * Owner/waiter RLS helpers and founder RPCs re-check it.
--   * Policy edits apply immediately to existing sessions.
--   * Missing registry row fails closed for privileged access. The client
--     registers a row on session restore before loading protected pages.
--   * Tokens, passwords and secrets are never stored in these tables.

-- ---------------------------------------------------------------------------
-- 1. Role policies (founder-managed)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_session_policies (
  role text primary key,
  idle_minutes integer not null,
  max_lifetime_hours integer not null,
  warning_seconds integer not null,
  warning_enabled boolean not null default true,
  auto_logout_enabled boolean not null default true,
  shared_device_lock boolean not null default false,
  preserve_unsaved boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint platform_session_policies_role_check check (role in ('founder', 'owner', 'waiter')),
  constraint platform_session_policies_idle_check check (idle_minutes between 1 and 1440),
  constraint platform_session_policies_lifetime_check check (max_lifetime_hours between 1 and 168),
  constraint platform_session_policies_warning_check check (warning_seconds between 30 and 3600),
  constraint platform_session_policies_warning_lt_idle_check check (warning_seconds < idle_minutes * 60)
);

insert into public.platform_session_policies (
  role, idle_minutes, max_lifetime_hours, warning_seconds, warning_enabled,
  auto_logout_enabled, shared_device_lock, preserve_unsaved
)
values
  ('founder', 15, 8, 120, true, true, false, true),
  ('owner', 30, 12, 120, true, true, false, true),
  ('waiter', 15, 8, 120, true, true, true, true)
on conflict (role) do nothing;

alter table public.platform_session_policies enable row level security;
revoke all on public.platform_session_policies from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Application session registry
-- ---------------------------------------------------------------------------
create table if not exists public.platform_app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  auth_session_id uuid,
  jwt_iat timestamptz,
  role text not null,
  restaurant_id uuid references public.restaurants (id) on delete set null,
  display_name text not null default '',
  user_agent text not null default '',
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text not null default '',
  revoked_at timestamptz,
  revoke_reason text not null default '',
  created_at timestamptz not null default now(),
  constraint platform_app_sessions_role_check check (role in ('founder', 'owner', 'waiter'))
);

create unique index if not exists platform_app_sessions_auth_session_active_key
  on public.platform_app_sessions (user_id, auth_session_id)
  where auth_session_id is not null and ended_at is null and revoked_at is null;

create unique index if not exists platform_app_sessions_user_fallback_active_key
  on public.platform_app_sessions (user_id)
  where auth_session_id is null and ended_at is null and revoked_at is null;

create index if not exists platform_app_sessions_user_idx
  on public.platform_app_sessions (user_id, started_at desc);

create index if not exists platform_app_sessions_active_idx
  on public.platform_app_sessions (last_activity_at desc)
  where ended_at is null and revoked_at is null;

alter table public.platform_app_sessions enable row level security;
revoke all on public.platform_app_sessions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Identity helpers
-- ---------------------------------------------------------------------------
create or replace function public.platform_auth_session_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw text;
begin
  v_raw := nullif(auth.jwt() ->> 'session_id', '');
  if v_raw is null then
    return null;
  end if;
  begin
    return v_raw::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.platform_jwt_iat()
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_iat bigint;
begin
  begin
    v_iat := nullif(auth.jwt() ->> 'iat', '')::bigint;
  exception when others then
    return null;
  end;
  if v_iat is null then
    return null;
  end if;
  return to_timestamp(v_iat);
end;
$$;

create or replace function public.platform_current_app_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then
    return 'founder';
  end if;
  if exists (select 1 from public.waiters w where w.auth_user_id = auth.uid()) then
    return 'waiter';
  end if;
  return 'owner';
end;
$$;

create or replace function public.platform_session_times(
  p_started_at timestamptz,
  p_last_activity_at timestamptz,
  p_idle_minutes integer,
  p_max_lifetime_hours integer
)
returns table (idle_expires_at timestamptz, absolute_expires_at timestamptz, expires_at timestamptz)
language sql
immutable
as $$
  select
    p_last_activity_at + make_interval(mins => p_idle_minutes),
    p_started_at + make_interval(hours => p_max_lifetime_hours),
    least(
      p_last_activity_at + make_interval(mins => p_idle_minutes),
      p_started_at + make_interval(hours => p_max_lifetime_hours)
    );
$$;

create or replace function public.platform_session_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_policy public.platform_session_policies;
  v_row public.platform_app_sessions;
  v_auth uuid;
  v_idle timestamptz;
  v_absolute timestamptz;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_role := public.platform_current_app_role();
  select * into v_policy from public.platform_session_policies where role = v_role;
  if not found then
    return false;
  end if;

  v_auth := public.platform_auth_session_id();
  if v_auth is not null then
    select * into v_row
    from public.platform_app_sessions s
    where s.user_id = auth.uid()
      and s.auth_session_id = v_auth
      and s.ended_at is null
    order by s.started_at desc
    limit 1;
  else
    select * into v_row
    from public.platform_app_sessions s
    where s.user_id = auth.uid()
      and s.auth_session_id is null
      and s.ended_at is null
    order by s.started_at desc
    limit 1;
  end if;

  if not found then
    return false;
  end if;
  if v_row.revoked_at is not null then
    return false;
  end if;
  if not v_policy.auto_logout_enabled then
    return true;
  end if;

  select idle_expires_at, absolute_expires_at
    into v_idle, v_absolute
  from public.platform_session_times(
    v_row.started_at, v_row.last_activity_at, v_policy.idle_minutes, v_policy.max_lifetime_hours
  );

  if now() >= v_idle or now() >= v_absolute then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.platform_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.platform_admins a
    where a.user_id = auth.uid()
      and coalesce(a.must_change_password, false) = false
  ) and public.platform_session_ok();
end;
$$;

create or replace function public.platform_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (
    select 1
    from public.platform_admins a
    where a.user_id = auth.uid()
      and coalesce(a.must_change_password, false) = false
  ) then
    raise exception 'Platform admin access required' using errcode = '42501';
  end if;
  if not public.platform_session_ok() then
    raise exception 'Session expired' using errcode = '28000';
  end if;
end;
$$;

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

drop policy if exists "owners read own restaurants" on public.restaurants;
create policy "owners read own restaurants"
  on public.restaurants for select
  to authenticated
  using (
    (auth.uid() = user_id and public.account_not_blocked(auth.uid()) and public.platform_session_ok())
    or public.platform_support_active(id)
  );

-- ---------------------------------------------------------------------------
-- 4. Session lifecycle RPCs
-- ---------------------------------------------------------------------------
create or replace function public.platform_session_start(p_user_agent text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_auth uuid;
  v_iat timestamptz;
  v_row public.platform_app_sessions;
  v_policy public.platform_session_policies;
  v_name text := '';
  v_restaurant uuid;
  v_agent text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  v_role := public.platform_current_app_role();
  v_auth := public.platform_auth_session_id();
  v_iat := public.platform_jwt_iat();
  v_agent := left(btrim(coalesce(p_user_agent, '')), 180);

  if v_role = 'founder' then
    select coalesce(a.username, '') into v_name
    from public.platform_admins a
    where a.user_id = auth.uid();
  elsif v_role = 'waiter' then
    select w.full_name, w.restaurant_id
      into v_name, v_restaurant
    from public.waiters w
    where w.auth_user_id = auth.uid()
    limit 1;
  else
    select coalesce(p.username, '') into v_name
    from public.profiles p
    where p.id = auth.uid();
  end if;

  if v_auth is not null then
    select * into v_row
    from public.platform_app_sessions
    where user_id = auth.uid()
      and auth_session_id = v_auth
      and ended_at is null
      and revoked_at is null
    limit 1;
  else
    select * into v_row
    from public.platform_app_sessions
    where user_id = auth.uid()
      and auth_session_id is null
      and ended_at is null
      and revoked_at is null
    limit 1;
    if found and v_iat is not null and v_row.jwt_iat is not null and v_iat > v_row.jwt_iat + interval '5 seconds' then
      update public.platform_app_sessions
        set ended_at = now(),
            end_reason = 'replaced_by_new_login'
        where id = v_row.id;
      v_row := null;
    end if;
  end if;

  if v_row.id is not null then
    update public.platform_app_sessions
      set last_activity_at = now(),
          display_name = coalesce(nullif(v_name, ''), display_name),
          restaurant_id = coalesce(v_restaurant, restaurant_id),
          user_agent = case when v_agent = '' then user_agent else v_agent end,
          jwt_iat = coalesce(v_iat, jwt_iat)
      where id = v_row.id
      returning * into v_row;
  else
    insert into public.platform_app_sessions (
      user_id, auth_session_id, jwt_iat, role, restaurant_id, display_name, user_agent
    )
    values (
      auth.uid(), v_auth, v_iat, v_role, v_restaurant, coalesce(v_name, ''), v_agent
    )
    returning * into v_row;
  end if;

  select * into v_policy from public.platform_session_policies where role = v_role;

  return jsonb_build_object(
    'session', to_jsonb(v_row),
    'policy', to_jsonb(v_policy),
    'ok', public.platform_session_ok()
  );
end;
$$;

create or replace function public.platform_session_touch()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_auth uuid;
  v_row public.platform_app_sessions;
  v_policy public.platform_session_policies;
  v_idle timestamptz;
  v_absolute timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  v_role := public.platform_current_app_role();
  v_auth := public.platform_auth_session_id();
  select * into v_policy from public.platform_session_policies where role = v_role;

  if v_auth is not null then
    select * into v_row
    from public.platform_app_sessions
    where user_id = auth.uid() and auth_session_id = v_auth and ended_at is null
    order by started_at desc
    limit 1;
  else
    select * into v_row
    from public.platform_app_sessions
    where user_id = auth.uid() and auth_session_id is null and ended_at is null
    order by started_at desc
    limit 1;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  if v_row.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked', 'session', to_jsonb(v_row), 'policy', to_jsonb(v_policy));
  end if;

  select idle_expires_at, absolute_expires_at into v_idle, v_absolute
  from public.platform_session_times(
    v_row.started_at, v_row.last_activity_at, v_policy.idle_minutes, v_policy.max_lifetime_hours
  );

  if v_policy.auto_logout_enabled and now() >= v_absolute then
    update public.platform_app_sessions
      set ended_at = now(), end_reason = 'absolute_timeout'
      where id = v_row.id and ended_at is null
      returning * into v_row;
    return jsonb_build_object('ok', false, 'reason', 'absolute', 'session', to_jsonb(v_row), 'policy', to_jsonb(v_policy));
  end if;

  if v_policy.auto_logout_enabled and now() >= v_idle then
    update public.platform_app_sessions
      set ended_at = now(),
          end_reason = case when v_policy.shared_device_lock then 'idle_lock' else 'idle_timeout' end
      where id = v_row.id and ended_at is null
      returning * into v_row;
    return jsonb_build_object('ok', false, 'reason', 'idle', 'session', to_jsonb(v_row), 'policy', to_jsonb(v_policy));
  end if;

  if v_row.last_activity_at < now() - interval '30 seconds' then
    update public.platform_app_sessions
      set last_activity_at = now()
      where id = v_row.id
      returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'reason', '', 'session', to_jsonb(v_row), 'policy', to_jsonb(v_policy));
end;
$$;

create or replace function public.platform_session_heartbeat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_auth uuid;
  v_row public.platform_app_sessions;
  v_policy public.platform_session_policies;
  v_idle timestamptz;
  v_absolute timestamptz;
  v_ok boolean;
  v_reason text := '';
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  v_role := public.platform_current_app_role();
  v_auth := public.platform_auth_session_id();
  select * into v_policy from public.platform_session_policies where role = v_role;

  if v_auth is not null then
    select * into v_row
    from public.platform_app_sessions
    where user_id = auth.uid() and auth_session_id = v_auth and ended_at is null
    order by started_at desc
    limit 1;
  else
    select * into v_row
    from public.platform_app_sessions
    where user_id = auth.uid() and auth_session_id is null and ended_at is null
    order by started_at desc
    limit 1;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing', 'role', v_role, 'policy', to_jsonb(v_policy));
  end if;

  select idle_expires_at, absolute_expires_at into v_idle, v_absolute
  from public.platform_session_times(
    v_row.started_at, v_row.last_activity_at, v_policy.idle_minutes, v_policy.max_lifetime_hours
  );

  v_ok := public.platform_session_ok();
  if v_row.revoked_at is not null then
    v_reason := 'revoked';
  elsif v_policy.auto_logout_enabled and now() >= v_absolute then
    v_reason := 'absolute';
  elsif v_policy.auto_logout_enabled and now() >= v_idle then
    v_reason := 'idle';
  end if;

  return jsonb_build_object(
    'ok', v_ok,
    'reason', v_reason,
    'role', v_role,
    'session', to_jsonb(v_row),
    'policy', to_jsonb(v_policy),
    'idle_expires_at', v_idle,
    'absolute_expires_at', v_absolute,
    'warning_at', case
      when v_policy.warning_enabled then v_idle - make_interval(secs => v_policy.warning_seconds)
      else null
    end
  );
end;
$$;

create or replace function public.platform_session_end(p_reason text default 'sign_out')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  v_auth := public.platform_auth_session_id();
  update public.platform_app_sessions
    set ended_at = coalesce(ended_at, now()),
        end_reason = case when ended_at is null then coalesce(nullif(btrim(p_reason), ''), 'sign_out') else end_reason end
    where user_id = auth.uid()
      and ended_at is null
      and (
        (v_auth is not null and auth_session_id = v_auth)
        or (v_auth is null and auth_session_id is null)
      );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Founder policy + live session administration
-- ---------------------------------------------------------------------------
create or replace function public.platform_get_session_policies()
returns setof public.platform_session_policies
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.platform_require_admin();
  return query
    select * from public.platform_session_policies
    order by case role when 'founder' then 1 when 'owner' then 2 else 3 end;
end;
$$;

create or replace function public.platform_set_session_policies(p_policies jsonb)
returns setof public.platform_session_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_item jsonb;
  v_idle integer;
  v_life integer;
  v_warn integer;
begin
  perform public.platform_require_admin();
  if p_policies is null or jsonb_typeof(p_policies) <> 'object' then
    raise exception 'Session policies are required' using errcode = '22023';
  end if;

  foreach v_role in array array['founder', 'owner', 'waiter']
  loop
    v_item := p_policies -> v_role;
    if v_item is null or jsonb_typeof(v_item) <> 'object' then
      raise exception 'Missing policy for %', v_role using errcode = '22023';
    end if;
    v_idle := coalesce((v_item ->> 'idle_minutes')::integer, 0);
    v_life := coalesce((v_item ->> 'max_lifetime_hours')::integer, 0);
    v_warn := coalesce((v_item ->> 'warning_seconds')::integer, 0);
    if v_idle < 1 or v_idle > 1440 then
      raise exception 'Idle timeout must be between 1 and 1440 minutes' using errcode = '22023';
    end if;
    if v_life < 1 or v_life > 168 then
      raise exception 'Maximum lifetime must be between 1 and 168 hours' using errcode = '22023';
    end if;
    if v_warn < 30 or v_warn > 3600 or v_warn >= v_idle * 60 then
      raise exception 'Warning must be shorter than the idle timeout' using errcode = '22023';
    end if;

    update public.platform_session_policies
      set idle_minutes = v_idle,
          max_lifetime_hours = v_life,
          warning_seconds = v_warn,
          warning_enabled = coalesce((v_item ->> 'warning_enabled')::boolean, true),
          auto_logout_enabled = coalesce((v_item ->> 'auto_logout_enabled')::boolean, true),
          shared_device_lock = coalesce((v_item ->> 'shared_device_lock')::boolean, false),
          preserve_unsaved = coalesce((v_item ->> 'preserve_unsaved')::boolean, true),
          updated_at = now(),
          updated_by = auth.uid()
      where role = v_role;
  end loop;

  perform public.platform_audit(
    'session_policy_update',
    null, null, '',
    jsonb_build_object('note', 'Policy changes apply immediately to existing sessions')
  );

  return query
    select * from public.platform_session_policies
    order by case role when 'founder' then 1 when 'owner' then 2 else 3 end;
end;
$$;

create or replace function public.platform_list_app_sessions()
returns table (
  id uuid,
  user_id uuid,
  role text,
  display_name text,
  restaurant_id uuid,
  restaurant_name text,
  started_at timestamptz,
  last_activity_at timestamptz,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz,
  status text,
  user_agent text,
  revoked_at timestamptz,
  ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.platform_require_admin();
  return query
    select
      s.id,
      s.user_id,
      s.role,
      s.display_name,
      s.restaurant_id,
      coalesce(r.name, ''),
      s.started_at,
      s.last_activity_at,
      times.idle_expires_at,
      times.absolute_expires_at,
      case
        when s.revoked_at is not null then 'revoked'
        when s.ended_at is not null then 'expired'
        when not p.auto_logout_enabled then 'active'
        when now() >= times.expires_at and p.shared_device_lock and now() >= times.idle_expires_at then 'locked'
        when now() >= times.expires_at then 'expired'
        when p.warning_enabled and now() >= times.idle_expires_at - make_interval(secs => p.warning_seconds) then 'warning'
        else 'active'
      end,
      s.user_agent,
      s.revoked_at,
      s.ended_at
    from public.platform_app_sessions s
    join public.platform_session_policies p on p.role = s.role
    left join public.restaurants r on r.id = s.restaurant_id
    cross join lateral public.platform_session_times(
      s.started_at, s.last_activity_at, p.idle_minutes, p.max_lifetime_hours
    ) times
    where s.started_at > now() - interval '14 days'
    order by s.last_activity_at desc
    limit 200;
end;
$$;

create or replace function public.platform_revoke_app_session(p_id uuid, p_reason text default '')
returns public.platform_app_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_app_sessions;
begin
  perform public.platform_require_admin();
  update public.platform_app_sessions
    set revoked_at = coalesce(revoked_at, now()),
        ended_at = coalesce(ended_at, now()),
        revoke_reason = coalesce(nullif(btrim(p_reason), ''), 'founder_revoke'),
        end_reason = case when ended_at is null then 'founder_revoke' else end_reason end
    where id = p_id
    returning * into v_row;
  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  perform public.platform_audit(
    'session_revoke',
    v_row.restaurant_id,
    v_row.user_id,
    coalesce(nullif(btrim(p_reason), ''), ''),
    jsonb_build_object('session_id', v_row.id, 'role', v_row.role, 'scope', 'session')
  );
  return v_row;
end;
$$;

create or replace function public.platform_revoke_user_sessions(p_user_id uuid, p_reason text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.platform_require_admin();
  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;
  update public.platform_app_sessions
    set revoked_at = coalesce(revoked_at, now()),
        ended_at = coalesce(ended_at, now()),
        revoke_reason = coalesce(nullif(btrim(p_reason), ''), 'founder_revoke_user'),
        end_reason = case when ended_at is null then 'founder_revoke_user' else end_reason end
    where user_id = p_user_id
      and ended_at is null;
  get diagnostics v_count = row_count;
  perform public.platform_audit(
    'session_revoke_user',
    null,
    p_user_id,
    coalesce(nullif(btrim(p_reason), ''), ''),
    jsonb_build_object('count', v_count, 'scope', 'account')
  );
  return v_count;
end;
$$;

revoke all on function public.platform_auth_session_id() from public, anon;
revoke all on function public.platform_jwt_iat() from public, anon;
revoke all on function public.platform_current_app_role() from public, anon;
revoke all on function public.platform_session_ok() from public, anon;
revoke all on function public.platform_session_start(text) from public, anon;
revoke all on function public.platform_session_touch() from public, anon;
revoke all on function public.platform_session_heartbeat() from public, anon;
revoke all on function public.platform_session_end(text) from public, anon;
revoke all on function public.platform_get_session_policies() from public, anon;
revoke all on function public.platform_set_session_policies(jsonb) from public, anon;
revoke all on function public.platform_list_app_sessions() from public, anon;
revoke all on function public.platform_revoke_app_session(uuid, text) from public, anon;
revoke all on function public.platform_revoke_user_sessions(uuid, text) from public, anon;

grant execute on function public.platform_session_ok() to authenticated;
grant execute on function public.platform_session_start(text) to authenticated;
grant execute on function public.platform_session_touch() to authenticated;
grant execute on function public.platform_session_heartbeat() to authenticated;
grant execute on function public.platform_session_end(text) to authenticated;
grant execute on function public.platform_get_session_policies() to authenticated;
grant execute on function public.platform_set_session_policies(jsonb) to authenticated;
grant execute on function public.platform_list_app_sessions() to authenticated;
grant execute on function public.platform_revoke_app_session(uuid, text) to authenticated;
grant execute on function public.platform_revoke_user_sessions(uuid, text) to authenticated;
