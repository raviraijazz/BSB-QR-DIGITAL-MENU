import { supabase } from '../lib/supabase'
import { waiterAuthEmailFromWaiterId } from '../lib/auth'

const WAITER_SELECT = 'id, restaurant_id, waiter_id, full_name, is_active, auth_user_id, created_at'
const DISABLED_MESSAGE = 'Your waiter account is currently disabled. Please contact the restaurant owner.'

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
  return { data: data ?? [], error }
}

export async function signInWaiter(waiterId, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: waiterAuthEmailFromWaiterId(waiterId),
    password,
  })
  if (error) return { waiter: null, error }
  const { data: waiter, error: waiterError } = await getMyWaiter()
  if (waiterError) {
    await supabase.auth.signOut()
    return { waiter: null, error: waiterError }
  }
  if (!waiter) {
    await supabase.auth.signOut()
    return { waiter: null, error: { message: 'Invalid waiter ID or password' } }
  }
  if (waiter.is_active === false) {
    await supabase.auth.signOut()
    return { waiter: null, error: waiterDisabledError() }
  }
  return { waiter, error: null }
}

export async function provisionWaiter(payload) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError }
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: { message: 'Not signed in' } }
  const { data, error } = await supabase.functions.invoke('provision-waiter', {
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
      return {
        data: null,
        error: {
          message: 'Waiter login setup is not deployed yet. Deploy supabase/functions/provision-waiter and set SUPABASE_SERVICE_ROLE_KEY on the function.',
        },
      }
    }
    return { data: null, error: { message: error.message || 'Could not create waiter login' } }
  }
  if (data?.error) return { data: null, error: { message: data.error } }
  return { data: data?.waiter || null, error: null }
}
