import { supabase } from '../lib/supabase'

const WAITER_ID_RE = /^[A-Za-z0-9_]{3,24}$/
const WAITER_SELECT = 'id, restaurant_id, waiter_id, full_name, is_active, auth_user_id, created_at'
const WAITER_SELECT_WITH_ASSIGNMENTS = `${WAITER_SELECT}, waiter_table_assignments(id)`

export function sanitizeWaiterId(value) {
  return String(value || '').trim()
}

export function sanitizeFullName(value) {
  return String(value || '').trim()
}

export function waiterIdKey(value) {
  return sanitizeWaiterId(value).toLowerCase()
}

export function assignedTableCount(waiter) {
  const rows = waiter?.waiter_table_assignments
  if (Array.isArray(rows)) return rows.length
  return 0
}

export function waiterHasLogin(waiter) {
  return Boolean(waiter?.auth_user_id)
}

export function waiterLoginStatus(waiter) {
  if (!waiterHasLogin(waiter)) return 'none'
  if (waiter.is_active === false) return 'disabled'
  return 'enabled'
}

export function waiterLoginLabel(waiter) {
  const status = waiterLoginStatus(waiter)
  if (status === 'enabled') return 'Login Enabled'
  if (status === 'disabled') return 'Login Disabled'
  return 'No Login'
}

export function hasDuplicateWaiterId(waiters, waiterId, excludeId) {
  const key = waiterIdKey(waiterId)
  if (!key) return false
  return (waiters || []).some((item) => item.id !== excludeId && waiterIdKey(item.waiter_id) === key)
}

export function validateWaiterFields({ fullName, waiterId }) {
  if (!sanitizeFullName(fullName)) return 'Full name required'
  if (sanitizeFullName(fullName).length > 80) return 'Full name is too long'
  const id = sanitizeWaiterId(waiterId)
  if (!id) return 'Waiter ID required'
  if (!WAITER_ID_RE.test(id)) return 'Waiter ID must be 3–24 letters, numbers or underscores'
  return ''
}

export function validateWaiterPasswords({ password, confirmPassword }) {
  if (!password) return 'Password required'
  if (password.length < 6) return 'Password too short'
  if (!confirmPassword) return 'Confirm password required'
  if (password !== confirmPassword) return 'Passwords do not match'
  return ''
}

function duplicateWaiterIdError() {
  return { message: 'This waiter ID is already in use.' }
}

function isDuplicateWaiterIdError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('waiters_waiter_id') || (text.includes('duplicate key') && text.includes('waiter_id'))
}

function isAuthUserRequiredError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('auth_user_id') && (text.includes('not-null') || text.includes('null value') || text.includes('not null'))
}

function isAssignmentJoinError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('waiter_table_assignments') || text.includes('could not find') || text.includes('relationship')
}

function friendlyWaiterError(error) {
  if (!error) return error
  if (isDuplicateWaiterIdError(error)) return duplicateWaiterIdError()
  if (isAuthUserRequiredError(error)) {
    return {
      message: 'Waiter records need a database update. Run supabase/waiters-nullable-auth.sql in the SQL Editor.',
    }
  }
  const text = String(error.message || '').toLowerCase()
  if (text.includes('waiters') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Waiter tables are not ready. Run supabase/table-wise-order-fixed.sql, then supabase/waiters-nullable-auth.sql.' }
  }
  return error
}

export async function listWaiters(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  let { data, error } = await supabase
    .from('waiters')
    .select(WAITER_SELECT_WITH_ASSIGNMENTS)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })
  if (error && isAssignmentJoinError(error)) {
    const fallback = await supabase
      .from('waiters')
      .select(WAITER_SELECT)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true })
    data = fallback.data
    error = fallback.error
  }
  return { data: data ?? [], error: friendlyWaiterError(error) }
}

export async function createWaiterRecord(restaurantId, values) {
  const fullName = sanitizeFullName(values.full_name)
  const waiterId = sanitizeWaiterId(values.waiter_id)
  const fieldError = validateWaiterFields({ fullName, waiterId })
  if (fieldError) return { data: null, error: { message: fieldError } }
  const payload = {
    restaurant_id: restaurantId,
    waiter_id: waiterId,
    full_name: fullName,
    is_active: values.is_active !== false,
  }
  const { data, error } = await supabase.from('waiters').insert(payload).select(WAITER_SELECT).single()
  return { data, error: friendlyWaiterError(error) }
}

export async function updateWaiter(id, restaurantId, values) {
  const payload = {}
  if (values.full_name != null) {
    const fullName = sanitizeFullName(values.full_name)
    if (!fullName) return { data: null, error: { message: 'Full name required' } }
    payload.full_name = fullName
  }
  if (values.waiter_id != null) {
    const waiterId = sanitizeWaiterId(values.waiter_id)
    const idError = validateWaiterFields({ fullName: 'x', waiterId })
    if (idError && idError !== 'Full name required') return { data: null, error: { message: idError } }
    payload.waiter_id = waiterId
  }
  if (values.is_active != null) payload.is_active = Boolean(values.is_active)
  if (!Object.keys(payload).length) return { data: null, error: { message: 'Nothing to update' } }
  const { data, error } = await supabase
    .from('waiters')
    .update(payload)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select(WAITER_SELECT)
    .single()
  return { data, error: friendlyWaiterError(error) }
}

export async function setWaiterActive(id, restaurantId, isActive) {
  return updateWaiter(id, restaurantId, { is_active: isActive })
}
