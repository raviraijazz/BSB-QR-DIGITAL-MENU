import { supabase } from '../lib/supabase'
import { firstRelated } from '../lib/orderCart'

const KOT_SELECT = 'id, restaurant_id, session_id, order_id, kot_number, kot_type, status, printed_at, created_at'
const KOT_ITEM_SELECT = 'id, kot_id, order_item_id, item_name, quantity, notes, created_at'
const ORDER_SELECT = 'id, restaurant_id, session_id, waiter_id, source_table_id, order_number, status, notes, created_at, updated_at'
const KITCHEN_SELECT = `${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT}), orders(${ORDER_SELECT}, waiters(full_name, waiter_id), table_sessions(session_number, status, primary_table_id))`

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
  return error
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
    .order('created_at', { ascending: true })
  if (error) {
    const fallback = await supabase
      .from('kots')
      .select(`${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT})`)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true })
    if (fallback.error) return { data: [], error: friendlyKotError(error) }
    return { data: fallback.data ?? [], error: null }
  }
  return { data: data ?? [], error: null }
}

export async function updateKotStatus(id, restaurantId, status) {
  const allowed = ['new', 'preparing', 'ready']
  if (!allowed.includes(status)) return { data: null, error: { message: 'Invalid kitchen status.' } }
  const { data, error } = await supabase
    .from('kots')
    .update({ status })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select(KOT_SELECT)
    .single()
  return { data, error: friendlyKotError(error) }
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
