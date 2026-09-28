import { supabase } from '../lib/supabase'
import { firstRelated } from '../lib/orderCart'

const KOT_SELECT = 'id, restaurant_id, session_id, order_id, kot_number, kot_type, status, printed_at, created_at'
const KOT_ITEM_SELECT = 'id, kot_id, order_item_id, item_name, quantity, notes, created_at'
const ORDER_SELECT = 'id, restaurant_id, session_id, waiter_id, source_table_id, order_number, status, notes, created_at, updated_at'
const KITCHEN_SELECT = `${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT}), orders(${ORDER_SELECT}, waiters(full_name, waiter_id), table_sessions(session_number, status, primary_table_id))`

const FORWARD_STATUS = { new: 'preparing', preparing: 'ready' }

function friendlyKotError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('kots') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Kitchen tickets are not ready. Run supabase/table-wise-order-fixed.sql, then supabase/kitchen-kot.sql.' }
  }
  if (text.includes('duplicate') && text.includes('kot')) {
    return { message: 'This order already has a kitchen ticket.' }
  }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: 'Kitchen status can only be updated by the restaurant owner.' }
  }
  return { message: 'Unable to update kitchen status. Please try again.' }
}

export function kotForOrder(order) {
  return firstRelated(order?.kots)
}

export async function listRestaurantKots(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('kots')
    .select(KITCHEN_SELECT)
      .eq('restaurant_id', restaurantId)
      .in('status', ['new', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
    if (error) {
      const fallback = await supabase
        .from('kots')
        .select(`${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT})`)
        .eq('restaurant_id', restaurantId)
        .in('status', ['new', 'preparing', 'ready'])
        .order('created_at', { ascending: true })
    if (fallback.error) return { data: [], error: friendlyKotError(error) }
    return { data: fallback.data ?? [], error: null }
  }
  return { data: data ?? [], error: null }
}

export function nextKotStatus(status) {
  return FORWARD_STATUS[status] || null
}

export async function updateKotStatus(id, restaurantId, status) {
  if (!id || !restaurantId) return { data: null, error: { message: 'Kitchen ticket not found.' } }
  const allowed = ['preparing', 'ready']
  if (!allowed.includes(status)) return { data: null, error: { message: 'Invalid kitchen status.' } }

  const current = await supabase
    .from('kots')
    .select(KOT_SELECT)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (current.error) return { data: null, error: friendlyKotError(current.error) }
  if (!current.data) return { data: null, error: { message: 'Kitchen ticket not found.' } }

  const expected = nextKotStatus(current.data.status)
  if (!expected || status !== expected) {
    return { data: null, error: { message: 'Kitchen status can only move from New to Preparing, then Ready.' } }
  }

  const { data, error } = await supabase
    .from('kots')
    .update({ status })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .eq('status', current.data.status)
    .select(KOT_SELECT)
    .maybeSingle()
  if (error) return { data: null, error: friendlyKotError(error) }
  if (!data) return { data: null, error: { message: 'Kitchen status can only move from New to Preparing, then Ready.' } }
  return { data, error: null }
}

export async function markKotPrinted(id, restaurantId) {
  const { data, error } = await supabase
    .from('kots')
    .update({ printed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select(KOT_SELECT)
    .single()
  return { data, error: friendlyKotError(error) }
}
