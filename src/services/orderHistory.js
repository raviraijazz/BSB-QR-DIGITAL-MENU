import { supabase } from '../lib/supabase'
import { HISTORY_EXPORT_LIMIT, HISTORY_PAGE_SIZE } from '../lib/orderHistory'

const ORDER_SELECT =
  'id, restaurant_id, session_id, waiter_id, source_table_id, order_number, status, notes, created_at, updated_at'
const ORDER_ITEM_SELECT =
  'id, order_id, menu_item_id, item_name, description, food_type, unit_price, quantity, line_total, notes, sent_to_kitchen, created_at'
const KOT_SELECT = 'id, restaurant_id, session_id, order_id, kot_number, kot_type, status, printed_at, created_at'
const KOT_ITEM_SELECT = 'id, kot_id, order_item_id, item_name, quantity, notes, created_at'
const SESSION_SELECT = 'id, restaurant_id, session_number, status, primary_table_id, started_at, closed_at, created_at, session_tables(table_id)'
const BILL_SELECT =
  'id, restaurant_id, session_id, bill_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, cgst_amount, sgst_amount, other_tax_amount, grand_total, status, created_at, updated_at'
const PAYMENT_SELECT =
  'id, restaurant_id, session_id, bill_id, payment_method, amount, payment_reference, paid_at, created_at'
const ORDER_FULL = `${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT}), kots(${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT})), table_sessions(${SESSION_SELECT}), waiters(full_name, waiter_id)`

function friendlyHistoryError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('does not exist') || text.includes('schema cache')) {
    return { message: 'Order history is not ready. Run supabase/table-wise-order-fixed.sql in the SQL Editor.' }
  }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: 'Unable to load order history. Please try again.' }
  }
  return { message: 'Unable to load order history. Please try again.' }
}

function uniqueIds(values) {
  return [...new Set((values || []).filter(Boolean))]
}

async function sessionIdsForTable(restaurantId, tableId) {
  const [linked, primary] = await Promise.all([
    supabase.from('session_tables').select('session_id, table_sessions!inner(restaurant_id)').eq('table_id', tableId).eq('table_sessions.restaurant_id', restaurantId),
    supabase.from('table_sessions').select('id').eq('restaurant_id', restaurantId).eq('primary_table_id', tableId),
  ])
  return uniqueIds([...(linked.data || []).map((row) => row.session_id), ...(primary.data || []).map((row) => row.id)])
}

async function resolveSearchIds(restaurantId, search) {
  const needle = String(search || '').trim()
  if (!needle) return { orderIds: null, sessionIds: null, waiterIds: null }
  const like = `%${needle}%`

  const [orders, kots, sessions, waiters, tables] = await Promise.all([
    supabase.from('orders').select('id').eq('restaurant_id', restaurantId).ilike('order_number', like).limit(200),
    supabase.from('kots').select('order_id').eq('restaurant_id', restaurantId).ilike('kot_number', like).limit(200),
    supabase.from('table_sessions').select('id').eq('restaurant_id', restaurantId).ilike('session_number', like).limit(200),
    supabase.from('waiters').select('id').eq('restaurant_id', restaurantId).or(`full_name.ilike.${like},waiter_id.ilike.${like}`).limit(50),
    supabase.from('restaurant_tables').select('id').eq('restaurant_id', restaurantId).or(`name.ilike.${like},table_number.ilike.${like}`).limit(50),
  ])

  const tableIds = (tables.data || []).map((row) => row.id)
  let tableSessionIds = []
  if (tableIds.length) {
    const [linked, primary] = await Promise.all([
      supabase.from('session_tables').select('session_id').in('table_id', tableIds),
      supabase.from('table_sessions').select('id').eq('restaurant_id', restaurantId).in('primary_table_id', tableIds),
    ])
    tableSessionIds = uniqueIds([...(linked.data || []).map((row) => row.session_id), ...(primary.data || []).map((row) => row.id)])
  }

  return {
    orderIds: uniqueIds([...(orders.data || []).map((row) => row.id), ...(kots.data || []).map((row) => row.order_id)]),
    sessionIds: uniqueIds([...(sessions.data || []).map((row) => row.id), ...tableSessionIds]),
    waiterIds: uniqueIds((waiters.data || []).map((row) => row.id)),
  }
}

function applyQuickIds(query, filters, extra) {
  let next = query
  if (filters.orderStatus) next = next.eq('status', filters.orderStatus)
  if (filters.waiterId) next = next.eq('waiter_id', filters.waiterId)
  if (filters.sessionId) next = next.eq('session_id', filters.sessionId)
  if (extra.orderIds?.length) next = next.in('id', extra.orderIds)
  if (extra.sessionIds?.length) next = next.in('session_id', extra.sessionIds)
  if (extra.waiterIds?.length && !filters.waiterId) next = next.in('waiter_id', extra.waiterIds)
  return next
}

export async function listOrderHistory({
  restaurantId,
  fromISO,
  toISO,
  filters = {},
  page = 0,
  pageSize = HISTORY_PAGE_SIZE,
} = {}) {
  if (!restaurantId) return { data: [], count: 0, bills: [], payments: [], error: null }

  const extra = { orderIds: null, sessionIds: null, waiterIds: null }
  const search = String(filters.search || '').trim()
  if (search) {
    const found = await resolveSearchIds(restaurantId, search)
    extra.orderIds = found.orderIds
    extra.sessionIds = found.sessionIds
    extra.waiterIds = found.waiterIds
    if (!found.orderIds.length && !found.sessionIds.length && !found.waiterIds.length) {
      return { data: [], count: 0, bills: [], payments: [], error: null }
    }
  }

  if (filters.tableId) {
    const tableSessions = await sessionIdsForTable(restaurantId, filters.tableId)
    extra.sessionIds = extra.sessionIds ? extra.sessionIds.filter((id) => tableSessions.includes(id)) : tableSessions
    if (filters.sessionId && !tableSessions.includes(filters.sessionId)) {
      return { data: [], count: 0, bills: [], payments: [], error: null }
    }
  }

  if (filters.kotStatus) {
    const kots = await supabase.from('kots').select('order_id').eq('restaurant_id', restaurantId).eq('status', filters.kotStatus)
    const ids = uniqueIds((kots.data || []).map((row) => row.order_id))
    extra.orderIds = extra.orderIds ? extra.orderIds.filter((id) => ids.includes(id)) : ids
    if (!ids.length || extra.orderIds.length === 0) return { data: [], count: 0, bills: [], payments: [], error: null }
  }

  if (filters.billStatus || filters.paymentState || filters.paymentMethod) {
    let billQuery = supabase.from('bills').select('session_id, status, id').eq('restaurant_id', restaurantId)
    if (filters.billStatus) billQuery = billQuery.eq('status', filters.billStatus)
    if (filters.paymentState === 'paid') billQuery = billQuery.eq('status', 'paid')
    if (filters.paymentState === 'partial') billQuery = billQuery.eq('status', 'payment_pending')
    if (filters.paymentState === 'voided') billQuery = billQuery.eq('status', 'cancelled')
    if (filters.paymentState === 'unpaid') billQuery = billQuery.eq('status', 'open')
    const bills = await billQuery
    let sessionIds = uniqueIds((bills.data || []).map((row) => row.session_id))
    if (filters.paymentMethod) {
      const pays = await supabase.from('payments').select('session_id').eq('restaurant_id', restaurantId).eq('payment_method', filters.paymentMethod)
      const paySessions = uniqueIds((pays.data || []).map((row) => row.session_id))
      sessionIds = sessionIds.filter((id) => paySessions.includes(id))
    }
    extra.sessionIds = extra.sessionIds ? extra.sessionIds.filter((id) => sessionIds.includes(id)) : sessionIds
    if (!sessionIds.length || extra.sessionIds.length === 0) return { data: [], count: 0, bills: [], payments: [], error: null }
  }

  const from = Math.max(0, Number(page) || 0) * pageSize
  const to = from + pageSize - 1

  function baseQuery(select) {
    let query = supabase
      .from('orders')
      .select(select, { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', fromISO)
      .lt('created_at', toISO)
      .order('created_at', { ascending: false })
      .range(from, to)
    return applyQuickIds(query, filters, extra)
  }

  let result = await baseQuery(ORDER_FULL)
  if (result.error) {
    result = await baseQuery(`${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT}), table_sessions(${SESSION_SELECT}), waiters(full_name, waiter_id)`)
  }
  if (result.error) {
    result = await baseQuery(ORDER_SELECT)
  }
  if (result.error) return { data: [], count: 0, bills: [], payments: [], error: friendlyHistoryError(result.error) }

  const orders = result.data || []
  const sessionIds = uniqueIds(orders.map((order) => order.session_id))
  let bills = []
  let payments = []
  if (sessionIds.length) {
    const billResult = await supabase.from('bills').select(BILL_SELECT).eq('restaurant_id', restaurantId).in('session_id', sessionIds)
    bills = billResult.data || []
    const billIds = uniqueIds(bills.map((bill) => bill.id))
    if (billIds.length) {
      const payResult = await supabase.from('payments').select(PAYMENT_SELECT).eq('restaurant_id', restaurantId).in('bill_id', billIds).order('paid_at', { ascending: true })
      payments = payResult.data || []
    }
  }

  return { data: orders, count: result.count || orders.length, bills, payments, error: null }
}

export async function listHistorySessions(restaurantId, fromISO, toISO) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('table_sessions')
    .select('id, session_number, started_at')
    .eq('restaurant_id', restaurantId)
    .gte('started_at', fromISO)
    .lt('started_at', toISO)
    .order('started_at', { ascending: false })
    .limit(200)
  if (error) return { data: [], error: friendlyHistoryError(error) }
  return { data: data || [], error: null }
}

export async function exportOrderHistory(params) {
  return listOrderHistory({ ...params, page: 0, pageSize: HISTORY_EXPORT_LIMIT })
}
