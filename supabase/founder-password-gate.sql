-- BSB Digital Menu — Founder Console: mandatory first-login password change
-- =========================================================================
-- RUN THIS AFTER supabase/founder-console.sql (which is itself run last among
-- the original migrations). Safe to run more than once; additive only.
--
-- What it does:
--   1. adds platform_admins.must_change_password (default true = fail closed)
--      and password_changed_at;
--   2. redefines platform_is_admin() so a founder who has not rotated the
--      temporary bootstrap password is NOT an admin for any database-side
--      check. Every founder RPC (support sessions, restaurant/account
--      management, menu import, audit reads) therefore fails closed, and the
--      support-session RLS grants are unavailable until the change completes.
--
-- The flag is written only by:
--   * the protected platform-admin-setup edge function (service role), and
--   * the platform-admin change_password action, after Supabase Auth accepts
--     the new password.
-- public.platform_admins is revoked from anon/authenticated, so clients cannot
-- set or clear the flag directly.

alter table public.platform_admins
  add column if not exists must_change_password boolean not null default true;
alter table public.platform_admins
  add column if not exists password_changed_at timestamptz;

create or replace function public.platform_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.user_id = auth.uid()
      and coalesce(a.must_change_password, false) = false
  );
$$;
