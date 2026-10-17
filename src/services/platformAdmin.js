import { supabase } from '../lib/supabase'

function friendly(error) {
  const raw = String(error?.message || '')
  if (raw.includes('Failed to send a request') || raw.includes('FunctionsFetchError') || raw.includes('Failed to fetch')) {
    return new Error('Founder Console backend is not reachable. Deploy the supabase/functions functions first.')
  }
  if (raw.includes('non-2xx')) return new Error('Founder Console request was rejected. Check your access.')
  return new Error(raw || 'Something went wrong. Please try again.')
}

async function invoke(fn, body) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    try {
      const payload = await error.context?.json?.()
      if (payload?.error) return { data: null, error: new Error(payload.error) }
    } catch {
      /* fall through */
    }
    return { data: null, error: friendly(error) }
  }
  if (data?.error) return { data: null, error: new Error(data.error) }
  return { data, error: null }
}

export function platformAdminCall(action, payload = {}) {
  return invoke('platform-admin', { action, ...payload })
}

// Server-side founder login: username + password only. Returns a session that
// the caller installs with supabase.auth.setSession().
export function founderLogin(username, password) {
  return invoke('platform-admin-auth', { username, password })
}

export function whoami() {
  return platformAdminCall('whoami')
}

export function loadOverview({ from, to } = {}) {
  return platformAdminCall('overview', { from, to })
}

export function listPlatformRestaurants({ search = '', status = '', page = 1, pageSize = 20 } = {}) {
  return platformAdminCall('restaurants', { search, status, page, pageSize })
}

export function getPlatformRestaurant(id) {
  return platformAdminCall('restaurant', { id })
}

export function fetchSheet(url) {
  return platformAdminCall('fetch_sheet', { url })
}

export function changePlatformAdminPassword({ currentPassword = '', newPassword, confirmPassword }) {
  return platformAdminCall('change_password', {
    current_password: currentPassword,
    new_password: newPassword,
    confirm_password: confirmPassword,
  })
}

async function rpc(fn, args) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const { data, error } = await supabase.rpc(fn, args)
  return { data, error: error ? friendly(error) : null }
}

// All mutations below are SECURITY DEFINER RPCs that re-check platform-admins
// server-side and write to the audit log.
export function startSupportSession(restaurantId, recovery = false) {
  return rpc('platform_start_support_session', { p_restaurant_id: restaurantId, p_recovery: recovery })
}

export function endSupportSession(sessionId, reason = '') {
  return rpc('platform_end_support_session', { p_session_id: sessionId, p_reason: reason })
}

export function manageRestaurant(restaurantId, action, { days, reason } = {}) {
  return rpc('platform_manage_restaurant', {
    p_restaurant_id: restaurantId,
    p_action: action,
    p_days: days ?? null,
    p_reason: reason ?? '',
  })
}

export function manageAccount(restaurantId, targetUserId, accountType, action, reason = '') {
  return rpc('platform_manage_account', {
    p_restaurant_id: restaurantId,
    p_target_user_id: targetUserId,
    p_account_type: accountType,
    p_action: action,
    p_reason: reason,
  })
}

export function importMenu(restaurantId, rows) {
  return rpc('platform_import_menu', { p_restaurant_id: restaurantId, p_rows: rows })
}

export function listAudit({ limit = 50, offset = 0 } = {}) {
  return rpc('platform_list_audit', { p_limit: limit, p_offset: offset })
}
