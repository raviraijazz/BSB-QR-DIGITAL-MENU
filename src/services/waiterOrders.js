import { supabase } from '../lib/supabase'
import { cartLineKey, isOpenSession, itemIsSoldOut, lineAmount, orderableVariants } from '../lib/orderCart'
import { normalizeFoodType } from '../lib/foodType'

const ORDER_SELECT = 'id, restaurant_id, session_id, waiter_id, source_table_id, order_number, status, notes, created_at, updated_at'
const ORDER_ITEM_SELECT = 'id, order_id, menu_item_id, item_name, description, food_type, unit_price, quantity, line_total, notes, sent_to_kitchen, created_at'
const KOT_SELECT = 'id, restaurant_id, session_id, order_id, kot_number, kot_type, status, printed_at, created_at'
const KOT_ITEM_SELECT = 'id, kot_id, order_item_id, item_name, quantity, notes, created_at'
const ORDER_WITH_KOT = `${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT}), kots(${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT}))`

function friendlyOrderError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('orders') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Orders are not ready. Run supabase/table-wise-order-fixed.sql in the SQL Editor.' }
  }
  if (text.includes('duplicate') && text.includes('order_number')) {
    return { message: 'Could not assign an order number. Try again.' }
  }
  if (text.includes('does not belong')) return { message: 'This order does not belong to the current restaurant.' }
  if (text.includes('kots') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Kitchen tickets are not ready. Run supabase/kitchen-kot.sql in the SQL Editor.' }
  }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: 'You can only order on tables assigned to you.' }
  }
  return error
}

export function orderSubtotal(items) {
  return (items || []).reduce((sum, item) => sum + (Number(item.line_total) || 0), 0)
}

async function nextOrderNumber(restaurantId) {
  const { data, error } = await supabase.rpc('next_order_number', { p_restaurant_id: restaurantId })
  if (error || !data) {
    const { data: rows } = await supabase.from('orders').select('order_number').eq('restaurant_id', restaurantId)
    const max = (rows || []).reduce((n, row) => {
      const value = Number(String(row.order_number || '').replace(/\D/g, '')) || 0
      return value > n ? value : n
    }, 0)
    return { number: String(max + 1).padStart(3, '0'), error: error && !rows ? error : null }
  }
  return { number: data, error: null }
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
      return { data: bare.data ?? [], error: friendlyOrderError(bare.error || error) }
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
      `${ORDER_WITH_KOT}, table_sessions(session_number, status, primary_table_id), waiters(full_name, waiter_id)`,
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
  if (error) {
    const fallback = await supabase
      .from('orders')
      .select(
        `${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT}), table_sessions(session_number, status, primary_table_id), waiters(full_name, waiter_id)`,
      )
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
    if (fallback.error) {
      const bare = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
      if (bare.error) return { data: [], error: friendlyOrderError(error) }
      return { data: bare.data ?? [], error: null }
    }
    return { data: fallback.data ?? [], error: null }
  }
  return { data: data ?? [], error: null }
}

async function nextKotNumber(restaurantId) {
  const { data, error } = await supabase.rpc('next_kot_number', { p_restaurant_id: restaurantId })
  if (error || !data) {
    const { data: rows } = await supabase.from('kots').select('kot_number').eq('restaurant_id', restaurantId)
    const max = (rows || []).reduce((n, row) => {
      const value = Number(String(row.kot_number || '').replace(/\D/g, '')) || 0
      return value > n ? value : n
    }, 0)
    return { number: String(max + 1).padStart(3, '0'), error: error && !rows ? error : null }
  }
  return { number: data, error: null }
}

function payloadItems(rows) {
  return rows.map((line) => ({
    menu_item_id: line.menu_item_id || null,
    item_name: line.item_name,
    description: String(line.description || '').trim(),
    food_type: line.food_type || null,
    unit_price: Number(line.unit_price) || 0,
    quantity: Number(line.quantity) || 1,
    notes: String(line.notes || '').trim(),
  }))
}

async function createKotForOrder(order, items) {
  const existing = await supabase
    .from('kots')
    .select(`${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT})`)
    .eq('order_id', order.id)
    .eq('restaurant_id', order.restaurant_id)
    .maybeSingle()
  if (existing.data) return { data: existing.data, error: null }

  const prior = await supabase
    .from('orders')
    .select('id')
    .eq('session_id', order.session_id)
    .eq('restaurant_id', order.restaurant_id)
    .neq('id', order.id)
    .limit(1)
  const kotType = prior.data?.length ? 'add_on' : 'new'
  const { number, error: numberError } = await nextKotNumber(order.restaurant_id)
  if (numberError) return { data: null, error: friendlyOrderError(numberError) }

  const { data: kot, error: kotError } = await supabase
    .from('kots')
    .insert({
      restaurant_id: order.restaurant_id,
      session_id: order.session_id,
      order_id: order.id,
      kot_number: number,
      kot_type: kotType,
      status: 'new',
    })
    .select(KOT_SELECT)
    .single()
  if (kotError) {
    const raced = await supabase
      .from('kots')
      .select(`${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT})`)
      .eq('order_id', order.id)
      .eq('restaurant_id', order.restaurant_id)
      .maybeSingle()
    if (raced.data) return { data: raced.data, error: null }
    return { data: null, error: friendlyOrderError(kotError) }
  }

  const kotItems = (items || []).map((item) => ({
    kot_id: kot.id,
    order_item_id: item.id,
    item_name: item.item_name,
    quantity: Number(item.quantity) || 1,
    notes: String(item.notes || '').trim(),
  }))
  const { data: createdItems, error: itemsError } = await supabase
    .from('kot_items')
    .insert(kotItems)
    .select(KOT_ITEM_SELECT)
  if (itemsError) {
    await supabase.from('kots').delete().eq('id', kot.id).eq('restaurant_id', order.restaurant_id)
    return { data: null, error: friendlyOrderError(itemsError) }
  }
  await supabase
    .from('order_items')
    .update({ sent_to_kitchen: true })
    .eq('order_id', order.id)
  return { data: { ...kot, kot_items: createdItems ?? [] }, error: null }
}

export function buildCartLine(item, variantName) {
  if (!item?.id) return { error: { message: 'Item required' } }
  if (itemIsSoldOut(item)) return { error: { message: 'This item is sold out.' } }
  const variants = orderableVariants(item)
  if (!variants.length) return { error: { message: 'This item is sold out.' } }
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

export async function createSessionOrder({ restaurantId, session, waiter, table, lines, notes }) {
  if (!restaurantId) return { data: null, error: { message: 'Restaurant required' } }
  if (!session?.id || session.restaurant_id !== restaurantId) {
    return { data: null, error: { message: 'Open a table session first.' } }
  }
  if (!isOpenSession(session)) {
    return { data: null, error: { message: 'This session is no longer open for orders.' } }
  }
  if (!waiter?.id || waiter.restaurant_id !== restaurantId) {
    return { data: null, error: { message: 'Waiter account required' } }
  }
  if (!table?.id || table.restaurant_id !== restaurantId) {
    return { data: null, error: { message: 'This table is not assigned to you.' } }
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

  const rpcText = String(rpc.error?.message || '').toLowerCase()
  const rpcMissing = rpcText.includes('could not find') || rpcText.includes('does not exist') || rpcText.includes('schema cache')
  if (rpc.error && !rpcMissing) return { data: null, error: friendlyOrderError(rpc.error) }

  const { number, error: numberError } = await nextOrderNumber(restaurantId)
  if (numberError) return { data: null, error: friendlyOrderError(numberError) }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      restaurant_id: restaurantId,
      session_id: session.id,
      waiter_id: waiter.id,
      source_table_id: table.id,
      order_number: number,
      status: 'new',
      notes: String(notes || '').trim(),
    })
    .select(ORDER_SELECT)
    .single()
  if (orderError || !order) return { data: null, error: friendlyOrderError(orderError) }

  const items = rows.map((line) => ({
    order_id: order.id,
    menu_item_id: line.menu_item_id || null,
    item_name: line.item_name,
    description: String(line.description || '').trim(),
    food_type: line.food_type || null,
    unit_price: Number(line.unit_price) || 0,
    quantity: Number(line.quantity) || 1,
    line_total: lineAmount(line.unit_price, line.quantity),
    notes: String(line.notes || '').trim(),
    sent_to_kitchen: false,
  }))

  const { data: createdItems, error: itemsError } = await supabase
    .from('order_items')
    .insert(items)
    .select(ORDER_ITEM_SELECT)
  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id).eq('restaurant_id', restaurantId)
    return { data: null, error: friendlyOrderError(itemsError) }
  }

  const kot = await createKotForOrder(order, createdItems ?? [])
  if (kot.error || !kot.data) {
    await supabase.from('orders').delete().eq('id', order.id).eq('restaurant_id', restaurantId)
    return {
      data: null,
      error: kot.error || { message: 'Kitchen ticket could not be created. The order was not sent. Try again.' },
    }
  }

  return { data: { ...order, order_items: createdItems ?? [], kots: [kot.data] }, error: null }
}
