-- BSB Digital Menu — Phase 28: Founder Console Integrations Hub.
-- Additive. Safe to re-run. Does not drop tables or restaurant/order/bill rows.
--
-- Run AFTER supabase/founder-console.sql.
--
-- This file does NOT create a secrets table and does NOT store API keys.
-- Google Sheets/CSV import already exists (platform-admin fetch_sheet +
-- platform_import_menu). WhatsApp Business, payment gateways, SMTP, and
-- webhooks are not implemented in this repository; the hub reports that
-- honestly. Test results are written to the existing platform_audit_log.

-- ---------------------------------------------------------------------------
-- 1. List integration activity from the existing audit log
-- ---------------------------------------------------------------------------
create or replace function public.platform_list_integration_activity(
  p_provider text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  provider text,
  action text,
  ok boolean,
  message text,
  restaurant_id uuid,
  restaurant_name text,
  actor_username text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_provider text;
begin
  perform public.platform_require_admin();
  v_provider := nullif(btrim(coalesce(p_provider, '')), '');
  if v_provider is not null and v_provider not in (
    'google_sheets', 'whatsapp_business', 'payment_gateway', 'email_smtp', 'webhooks'
  ) then
    raise exception 'Unknown integration provider' using errcode = '22023';
  end if;

  return query
    select a.id,
      case
        when a.action = 'menu_import' then 'google_sheets'
        else coalesce(a.details ->> 'provider', '')
      end,
      a.action,
      case
        when a.action = 'menu_import' then true
        else coalesce(a.details -> 'ok' = 'true'::jsonb, false)
      end,
      case
        when a.action = 'menu_import' then
          'Imported '
          || coalesce(a.details ->> 'created_items', '0')
          || ' items'
        else left(coalesce(a.details ->> 'message', a.reason, ''), 280)
      end,
      a.target_restaurant_id,
      coalesce(r.name, ''),
      a.actor_username,
      a.created_at,
      count(*) over()
    from public.platform_audit_log a
    left join public.restaurants r on r.id = a.target_restaurant_id
    where a.action in ('menu_import', 'integration_test')
      and (
        v_provider is null
        or (a.action = 'menu_import' and v_provider = 'google_sheets')
        or coalesce(a.details ->> 'provider', '') = v_provider
      )
    order by a.created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Record a privileged connection test (no secrets in details)
-- ---------------------------------------------------------------------------
create or replace function public.platform_record_integration_test(
  p_provider text,
  p_ok boolean,
  p_message text default '',
  p_row_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
  v_message text;
  v_details jsonb;
begin
  perform public.platform_require_admin();
  v_provider := btrim(coalesce(p_provider, ''));
  if v_provider <> 'google_sheets' then
    raise exception 'Connection tests are only implemented for Google Sheets' using errcode = '22023';
  end if;

  v_message := left(
    regexp_replace(
      coalesce(p_message, ''),
      '(Bearer[[:space:]]+)[^[:space:]]+',
      '\1[redacted]',
      'gi'
    ),
    280
  );

  v_details := jsonb_build_object(
    'provider', v_provider,
    'ok', coalesce(p_ok, false),
    'message', v_message,
    'row_count', p_row_count
  );

  perform public.platform_audit(
    'integration_test',
    null,
    null,
    '',
    v_details
  );

  return v_details;
end;
$$;

revoke all on function public.platform_list_integration_activity(text, integer, integer) from public, anon;
revoke all on function public.platform_record_integration_test(text, boolean, text, integer) from public, anon;
grant execute on function public.platform_list_integration_activity(text, integer, integer) to authenticated;
grant execute on function public.platform_record_integration_test(text, boolean, text, integer) to authenticated;
