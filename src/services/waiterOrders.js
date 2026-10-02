import { supabase } from '../lib/supabase'
import { cartLineKey, isOpenSession, itemIsSoldOut, orderableVariants } from '../lib/orderCart'
import { normalizeFoodType } from '../lib/foodType'

const ORDER_SELECT = 'id, restaurant_id, session_id, waiter_id, source_table_id, order_number, status, notes, created_at, updated_at'
const ORDER_ITEM_SELECT = 'id, order_id, menu_item_id, item_name, description, food_type, unit_price, quantity, line_total, notes, sent_to_kitchen, created_at'
const KOT_SELECT = 'id, restaurant_id, session_id, order_id, kot_number, kot_type, status, printed_at, created_at'
const KOT_ITEM_SELECT = 'id, kot_id, order_item_id, item_name, quantity, notes, created_at'
const ORDER_WITH_KOT = `${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT}), kots(${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT}))`

function friendlyOrderError(error, kind = 'submit') {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('submit_waiter_order') && (text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find'))) {
    return { message: 'Orders are not ready. Run supabase/waiter-order-submit.sql in the SQL Editor.' }
  }
  if (text.includes('orders') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Orders are not ready. Run supabase/table-wise-order-fixed.sql in the SQL Editor.' }
  }
  if (text.includes('no longer available') || text.includes('sold out')) {
    return { message: 'This item is no longer available.' }
  }
  if (text.includes('select a variant')) return { message: 'Select a variant.' }
  if (text.includes('no longer open') || text.includes('no longer active')) {
    return { message: 'This table session is no longer active.' }
  }
  if (text.includes('assigned to you') || text.includes('not assigned')) {
    return { message: 'You are not assigned to this table.' }
  }
  if (text.includes('duplicate') && text.includes('order_number')) {
    return { message: 'Unable to place order. Please try again.' }
  }
  if (text.includes('add at least one item')) return { message: 'Add at least one item.' }
  if (text.includes('disabled')) return { message: 'This waiter login is disabled. Contact the restaurant owner.' }
  if (text.includes('does not belong')) return { message: 'Unable to place order. Please try again.' }
  if (text.includes('kots') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Kitchen tickets are not ready. Run supabase/kitchen-kot.sql in the SQL Editor.' }
  }
  if (kind === 'list') {
    if (text.includes('not allowed') || text.includes('row-level security')) {
      return { message: 'Unable to load orders. Please try again.' }
    }
    return { message: 'Unable to load orders. Please try again.' }
  }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: 'Unable to place order. Please try again.' }
  }
  return { message: 'Unable to place order. Please try again.' }
}

export function orderSubtotal(items) {
  return (items || []).reduce((sum, item) => sum + (Number(item.line_total) || 0), 0)
}

export async function listSessionOrders(restaurantId, sessionId) {
  if (!restaurantId || !sessionId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_KOT)
    .eq('restaurant_id', restaurantId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) {
    const fallback = await supabase
      .from('orders')
      .select(`${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT})`)
      .eq('restaurant_id', restaurantId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (fallback.error) {
      const bare = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', restaurantId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      return { data: bare.data ?? [], error: friendlyOrderError(bare.error || error, 'list') }
    }
    return { data: fallback.data ?? [], error: null }
  }
  return { data: data ?? [], error: null }
}

export async function listRestaurantOrders(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('orders')
    .select(
      `${ORDER_WITH_KOT}, table_sessions(session_number, status, primary_table_id, session_tables(table_id)), waiters(full_name, waiter_id)`,
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
  if (error) {
    const fallback = await supabase
      .from('orders')
      .select(
        `${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT}), table_sessions(session_number, status, primary_table_id, session_tables(table_id)), waiters(full_name, waiter_id)`,
      )
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
    if (fallback.error) {
      const bare = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
      if (bare.error) return { data: [], error: friendlyOrderError(error, 'list') }
      return { data: bare.data ?? [], error: null }
    }
    return { data: fallback.data ?? [], error: null }
  }
  return { data: data ?? [], error: null }
}

function payloadItems(rows) {
  return rows.map((line) => ({
    menu_item_id: line.menu_item_id || null,
    item_name: line.item_name,
    variant_name: String(line.variant_name || '').trim(),
    description: String(line.description || '').trim(),
    food_type: line.food_type || null,
    unit_price: Number(line.unit_price) || 0,
    quantity: Number(line.quantity) || 1,
    notes: String(line.notes || '').trim(),
  }))
}

export function buildCartLine(item, variantName) {
  if (!item?.id) return { error: { message: 'Item required' } }
  if (itemIsSoldOut(item)) return { error: { message: 'This item is no longer available.' } }
  const variants = orderableVariants(item)
  if (!variants.length) return { error: { message: 'This item is no longer available.' } }
  const hasNamed = variants.some((row) => row.name)
  let chosen = variants[0]
  if (hasNamed) {
    chosen = variants.find((row) => row.name === variantName)
    if (!chosen) return { error: { message: 'Select a variant.' } }
  }
  const name = chosen.name ? `${item.name} (${chosen.name})` : item.name
  return {
    error: null,
    line: {
      key: cartLineKey(item.id, chosen.name || ''),
      menu_item_id: item.id,
      item_name: name,
      description: String(item.description || '').trim(),
      food_type: normalizeFoodType(item.food_type),
      unit_price: Number(chosen.price) || 0,
      quantity: 1,
      variant_name: chosen.name || '',
      notes: '',
    },
  }
}

export function upsertCartLine(lines, nextLine) {
  const current = lines || []
  const index = current.findIndex((row) => row.key === nextLine.key)
  if (index === -1) return [...current, { ...nextLine, quantity: Number(nextLine.quantity) || 1 }]
  const copy = current.slice()
  copy[index] = { ...copy[index], quantity: (Number(copy[index].quantity) || 0) + (Number(nextLine.quantity) || 1) }
  return copy
}

export function setCartQuantity(lines, key, quantity) {
  const qty = Number(quantity)
  if (!qty || qty <= 0) return (lines || []).filter((row) => row.key !== key)
  return (lines || []).map((row) => (row.key === key ? { ...row, quantity: qty } : row))
}

export function setCartNote(lines, key, notes) {
  return (lines || []).map((row) => (row.key === key ? { ...row, notes: String(notes || '') } : row))
}

export function removeCartLine(lines, key) {
  return (lines || []).filter((row) => row.key !== key)
}

export function clearCart() {
  return []
}

export async function createSessionOrder({ restaurantId, session, waiter, table, lines, notes }) {
  if (!restaurantId) return { data: null, error: { message: 'Restaurant required' } }
  if (!session?.id || session.restaurant_id !== restaurantId) {
    return { data: null, error: { message: 'Open a table session first.' } }
  }
  if (!isOpenSession(session)) {
    return { data: null, error: { message: 'This table session is no longer active.' } }
  }
  if (!waiter?.id || waiter.restaurant_id !== restaurantId) {
    return { data: null, error: { message: 'Unable to place order. Please try again.' } }
  }
  if (!table?.id || table.restaurant_id !== restaurantId) {
    return { data: null, error: { message: 'You are not assigned to this table.' } }
  }
  const rows = (lines || []).filter((line) => Number(line.quantity) > 0)
  if (!rows.length) return { data: null, error: { message: 'Add at least one item.' } }

  const rpc = await supabase.rpc('submit_waiter_order', {
    p_restaurant_id: restaurantId,
    p_session_id: session.id,
    p_table_id: table.id,
    p_items: payloadItems(rows),
    p_notes: String(notes || '').trim(),
  })
  if (!rpc.error && rpc.data) return { data: rpc.data, error: null }
  return { data: null, error: friendlyOrderError(rpc.error) }
}
