import { supabase } from '../lib/supabase'

// Client-side marker for "the browser has no usable Supabase session".
// Kept separate from network/authorization errors so the UI can send the user
// back to the Founder sign-in page instead of blaming the backend.
export const SESSION_REQUIRED = 'session_required'

function sessionRequiredError() {
  const error = new Error('Your Founder Console session has ended. Please sign in again.')
  error.code = SESSION_REQUIRED
  return error
}

function friendly(error) {
  const raw = String(error?.message || '')
  if (
    raw.includes('Failed to send a request') ||
    raw.includes('FunctionsFetchError') ||
    raw.includes('Failed to fetch')
  ) {
    return new Error('Founder Console backend is not reachable. Check your connection and try again.')
  }
  if (raw.includes('non-2xx')) return new Error('Founder Console request was rejected. Check your access.')
  return new Error(raw || 'Something went wrong. Please try again.')
}

async function readSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data?.session || null
}

async function refreshSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.refreshSession()
  if (error) return null
  return data?.session || null
}

async function readFunctionError(error) {
  const context = error?.context
  if (context && typeof context.json === 'function') {
    try {
      const payload = await context.json()
      if (payload?.error) return String(payload.error)
      if (payload?.message) return String(payload.message)
    } catch {
      /* fall through */
    }
  }
  return ''
}

function isAuthFailure(message) {
  return /not signed in|invalid jwt|jwt expired|unauthorized|missing authorization/i.test(String(message || ''))
}

function normalize(message) {
  if (isAuthFailure(message)) return sessionRequiredError()
  return new Error(message)
}

// Invokes a Founder Console edge function with an explicit bearer token.
// supabase-js omits the Authorization header when no session exists, so being
// explicit lets us detect an ended session instead of receiving a 401 from the
// function. On 401/403 we refresh once and retry, then report a session error.
async function invoke(fn, body, { auth = true } = {}) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }

  let accessToken = ''
  if (auth) {
    const session = await readSession()
    if (!session?.access_token) return { data: null, error: sessionRequiredError() }
    accessToken = session.access_token
  }

  const call = (token) =>
    supabase.functions.invoke(fn, {
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

  let { data, error } = await call(accessToken)

  const status = Number(error?.context?.status || 0)
  if (auth && error && (status === 401 || status === 403)) {
    const refreshed = await refreshSession()
    if (!refreshed?.access_token) return { data: null, error: sessionRequiredError() }
    accessToken = refreshed.access_token
    ;({ data, error } = await call(accessToken))
  }

  if (error) {
    const message = await readFunctionError(error)
    if (message) return { data: null, error: normalize(message) }
    return { data: null, error: friendly(error) }
  }

  if (data?.error) return { data: null, error: normalize(data.error) }
  return { data, error: null }
}

export function platformAdminCall(action, payload = {}) {
  return invoke('platform-admin', { action, ...payload })
}

// The founder has no session yet, so this call must NOT require one.
export function founderLogin(username, password) {
  return invoke('platform-admin-auth', { username, password }, { auth: false })
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

// Installs a session returned by the backend. Returns the installed session so
// callers can confirm persistence before navigating.
export async function installSession(session) {
  if (!supabase) return { session: null, error: new Error('Supabase is not configured.') }
  if (!session?.access_token || !session?.refresh_token) {
    return { session: null, error: sessionRequiredError() }
  }
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error) return { session: null, error: sessionRequiredError() }
  const stored = await readSession()
  if (!stored?.access_token) return { session: null, error: sessionRequiredError() }
  return { session: data.session || stored, error: null }
}

async function rpc(fn, args) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const session = await readSession()
  if (!session?.access_token) return { data: null, error: sessionRequiredError() }
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

export function listSubscriptionPlans(includeArchived = false) {
  return rpc('platform_list_plans', { p_include_archived: includeArchived })
}

export function upsertSubscriptionPlan(plan) {
  return rpc('platform_upsert_plan', {
    p_id: plan.id || null,
    p_name: plan.name,
    p_description: plan.description || '',
    p_price_inr: Number(plan.price_inr),
    p_billing_cycle: plan.billing_cycle,
    p_custom_cycle_days: plan.billing_cycle === 'custom' ? Number(plan.custom_cycle_days) : null,
    p_features: Array.isArray(plan.features) ? plan.features : [],
    p_max_waiters: plan.max_waiters === '' || plan.max_waiters == null ? null : Number(plan.max_waiters),
    p_default_duration_days:
      plan.default_duration_days === '' || plan.default_duration_days == null
        ? null
        : Number(plan.default_duration_days),
    p_status: plan.status || 'active',
  })
}

export function setSubscriptionPlanStatus(planId, status) {
  return rpc('platform_set_plan_status', { p_id: planId, p_status: status })
}

export function getSubscriptionSettings() {
  return rpc('platform_get_subscription_settings')
}

export function setSubscriptionSettings({ planId, durationDays, enabled }) {
  return rpc('platform_set_subscription_settings', {
    p_default_plan_id: planId || null,
    p_default_duration_days: Number(durationDays),
    p_auto_assign_enabled: Boolean(enabled),
  })
}

export function assignSubscription(payload) {
  return rpc('platform_assign_subscription', payload)
}

export function listSubscriptionAssignments(restaurantId) {
  return rpc('platform_list_assignments', { p_restaurant_id: restaurantId })
}

export function listSubscriptionInvoices({
  search = '',
  planId = null,
  status = '',
  method = '',
  from = null,
  to = null,
  page = 1,
  pageSize = 20,
} = {}) {
  return rpc('platform_list_subscription_invoices', {
    p_search: search,
    p_plan_id: planId || null,
    p_status: status || '',
    p_method: method || '',
    p_from: from || null,
    p_to: to || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  })
}

export function getSubscriptionBillingSummary({ from = null, to = null } = {}) {
  return rpc('platform_subscription_billing_summary', { p_from: from || null, p_to: to || null })
}

export function getSubscriptionInvoice(id) {
  return rpc('platform_subscription_invoice_detail', { p_id: id })
}

export function createSubscriptionInvoice(payload) {
  return rpc('platform_create_subscription_invoice', payload)
}

export function recordSubscriptionPayment(payload) {
  return rpc('platform_record_subscription_payment', payload)
}

export function cancelSubscriptionInvoice(invoiceId, reason = '') {
  return rpc('platform_cancel_subscription_invoice', { p_invoice_id: invoiceId, p_reason: reason })
}

export function loadPlatformReports({
  from,
  to,
  restaurantId = null,
  status = '',
  planId = null,
  orderStatus = '',
  paymentMethod = '',
  bucket = 'day',
  expiryDays = 30,
} = {}) {
  return rpc('platform_reports', {
    p_from: from,
    p_to: to,
    p_restaurant_id: restaurantId || null,
    p_status: status || '',
    p_plan_id: planId || null,
    p_order_status: orderStatus || '',
    p_payment_method: paymentMethod || '',
    p_bucket: bucket || 'day',
    p_expiry_days: Number(expiryDays) || 30,
  })
}
