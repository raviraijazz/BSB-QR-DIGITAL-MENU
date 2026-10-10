import { supabase } from '../lib/supabase'
import { waiterAuthEmailFromWaiterId } from '../lib/auth'
import { roleFromUser } from './profiles'

const WAITER_SELECT = 'id, restaurant_id, waiter_id, full_name, is_active, auth_user_id, created_at'
const DISABLED_MESSAGE = 'This waiter login is disabled. Contact the restaurant owner.'
const UNEXPECTED_SIGNIN = 'Unable to sign in right now. Please try again.'

export const WAITER_LOGIN_DEBUG = false

export function waiterDisabledError() {
  return { message: DISABLED_MESSAGE }
}

export async function getMyWaiter() {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) return { data: null, error: userError }
  const userId = userData.user?.id
  if (!userId) return { data: null, error: { message: 'Not signed in' } }
  const { data, error } = await supabase
    .from('waiters')
    .select(WAITER_SELECT)
    .eq('auth_user_id', userId)
    .maybeSingle()
  return { data, error }
}

export async function getWaiterRestaurant(restaurantId) {
  if (!restaurantId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, slug, phone, address, logo_url')
    .eq('id', restaurantId)
    .maybeSingle()
  return { data, error }
}

export async function listMyAssignedTables(restaurantId, waiterUuid) {
  if (!restaurantId || !waiterUuid) return { data: [], error: null }
  const { data: assignments, error: assignError } = await supabase
    .from('waiter_table_assignments')
    .select('table_id')
    .eq('restaurant_id', restaurantId)
    .eq('waiter_id', waiterUuid)
  if (assignError) return { data: [], error: assignError }
  const ids = (assignments || []).map((row) => row.table_id).filter(Boolean)
  if (!ids.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('id, restaurant_id, name, table_number, is_active, capacity, sort_order')
    .eq('restaurant_id', restaurantId)
    .in('id', ids)
    .order('sort_order', { ascending: true })
  return { data: (data ?? []).filter((row) => row.is_active !== false), error }
}

function mapWaiterAuthError(error) {
  const msg = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '').toLowerCase()
  if (msg.includes('email not confirmed') || code === 'email_not_confirmed') {
    return { message: 'This waiter login is not confirmed. Ask the restaurant owner to change the waiter password once.' }
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('invalid_grant')) {
    return { message: 'Invalid waiter ID or password' }
  }
  return { message: UNEXPECTED_SIGNIN }
}

async function invokeOwnerFunction(name, payload, notDeployedMessage) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: { message: UNEXPECTED_SIGNIN } }
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: { message: 'Not signed in' } }
  const { data, error } = await supabase.functions.invoke(name, {
    body: payload,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) {
    const context = error.context
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json()
        if (body?.error) return { data: null, error: { message: body.error } }
      } catch {
        /* fall through */
      }
    }
    const text = String(error.message || '').toLowerCase()
    if (text.includes('failed to send') || text.includes('not found') || text.includes('404')) {
      return { data: null, error: { message: notDeployedMessage } }
    }
    return { data: null, error: { message: error.message || 'Could not complete the request' } }
  }
  if (data?.error) return { data: null, error: { message: data.error } }
  return { data, error: null }
}

export async function signInWaiter(waiterId, password) {
  const trimmedId = String(waiterId || '').trim()
  const email = waiterAuthEmailFromWaiterId(trimmedId)
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    return { waiter: null, error: mapWaiterAuthError(error) }
  }

  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  const userId = user?.id
  if (!userId) {
    await supabase.auth.signOut()
    return { waiter: null, error: { message: 'Invalid waiter ID or password' } }
  }

  const [{ data: profile }, { data: waiter, error: waiterError }] = await Promise.all([
    supabase.from('profiles').select('id, role').eq('id', userId).maybeSingle(),
    supabase.from('waiters').select(WAITER_SELECT).eq('auth_user_id', userId).maybeSingle(),
  ])

  if (waiterError) {
    await supabase.auth.signOut()
    return { waiter: null, error: { message: UNEXPECTED_SIGNIN } }
  }
  if (!waiter) {
    await supabase.auth.signOut()
    const role = roleFromUser(user, profile)
    if (role === 'owner') return { waiter: null, error: { message: 'Use owner login instead.' } }
    return { waiter: null, error: { message: 'This waiter account is not linked correctly. Contact the restaurant owner.' } }
  }
  if (!waiter.restaurant_id) {
    await supabase.auth.signOut()
    return { waiter: null, error: { message: 'Restaurant assignment is missing. Contact the restaurant owner.' } }
  }
  if (waiter.is_active === false) {
    await supabase.auth.signOut()
    return { waiter: null, error: waiterDisabledError() }
  }
  return { waiter, error: null }
}

export async function provisionWaiter(payload) {
  const result = await invokeOwnerFunction(
    'provision-waiter',
    payload,
    'Waiter login setup is not deployed yet. Redeploy supabase/functions/provision-waiter.',
  )
  if (result.error) return { data: null, error: result.error }
  return { data: result.data?.waiter || null, error: null }
}

export async function changeWaiterPassword({ restaurantId, waiterRecordId, password }) {
  const result = await invokeOwnerFunction(
    'manage-waiter-password',
    {
      restaurant_id: restaurantId,
      waiter_record_id: waiterRecordId,
      password,
    },
    'Waiter password management is not deployed yet. Deploy supabase/functions/manage-waiter-password.',
  )
  if (result.error) return { error: result.error }
  return { error: null }
}

export async function changeOwnWaiterPassword({ waiterId, currentPassword, newPassword }) {
  const email = waiterAuthEmailFromWaiterId(waiterId)
  const { error: checkError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (checkError) {
    const msg = String(checkError.message || '').toLowerCase()
    if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('invalid_grant')) {
      return { error: { message: 'Current password is incorrect.' } }
    }
    return { error: { message: UNEXPECTED_SIGNIN } }
  }
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) return { error: { message: 'Unable to change password right now. Please try again.' } }
  return { error: null }
}
