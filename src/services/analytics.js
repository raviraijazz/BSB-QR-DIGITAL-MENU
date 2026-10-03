import { supabase } from '../lib/supabase'
import { listRestaurantBills } from './bills'
import { listRestaurantPayments } from './payments'
import { listRestaurantOrders } from './waiterOrders'
import { listTables } from './tables'
import { listWaiters } from './waiters'
import { listCategories } from './categories'
import { listMenuItems } from './menuItems'

const ORDER_SELECT = 'id, restaurant_id, session_id, waiter_id, source_table_id, order_number, status, notes, created_at, updated_at'
const ORDER_ITEM_SELECT = 'id, order_id, menu_item_id, item_name, description, food_type, unit_price, quantity, line_total, notes, created_at'
const KOT_SELECT = 'id, restaurant_id, session_id, order_id, kot_number, kot_type, status, printed_at, created_at'
const KOT_ITEM_SELECT = 'id, kot_id, order_item_id, item_name, quantity, notes, created_at'
const SESSION_SELECT = 'id, session_number, primary_table_id, status, started_at, session_tables(table_id)'
const ROW_CAP = 5000

const TYPE_NEEDS = {
  collections: ['payments', 'bills', 'sessions', 'ordersLite'],
  sales: ['orders', 'sessions'],
  payments: ['payments', 'bills', 'sessions', 'ordersLite'],
  waiters: ['payments', 'bills', 'sessions', 'ordersLite'],
  tables: ['payments', 'bills', 'sessions', 'ordersLite'],
  items: ['orders', 'sessions', 'categories', 'menuItems'],
  discounts: ['payments', 'bills', 'sessions'],
  kitchen: ['kots', 'sessions', 'ordersLite'],
  outstanding: ['bills', 'payments', 'sessions', 'ordersLite'],
}

function uniqueIds(rows, key) {
  return [...new Set((rows || []).map((row) => row[key]).filter(Boolean))]
}

function chunks(list, size = 200) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function applyDate(query, column, fromISO, toISO) {
  let next = query
  if (fromISO) next = next.gte(column, fromISO)
  if (toISO) next = next.lt(column, toISO)
  return next.limit(ROW_CAP)
}

async function loadByIds(table, select, restaurantId, ids) {
  if (!ids.length) return { data: [], error: null }
  const rows = []
  let error = null
  for (const group of chunks(ids, 200)) {
    const res = await supabase.from(table).select(select).eq('restaurant_id', restaurantId).in('id', group)
    if (res.error) {
      error = res.error
      break
    }
    rows.push(...(res.data || []))
  }
  return { data: rows, error }
}

async function loadSessions(restaurantId, ids) {
  if (!ids.length) return { data: [], error: null }
  const { data, error } = await loadByIds('table_sessions', SESSION_SELECT, restaurantId, ids)
  if (!error) return { data, error: null }
  return loadByIds('table_sessions', 'id, session_number, primary_table_id, status, started_at', restaurantId, ids)
}

async function loadOrdersForSessions(restaurantId, sessionIds) {
  if (!sessionIds.length) return { data: [], error: null }
  const rows = []
  let error = null
  for (const group of chunks(sessionIds, 200)) {
    const res = await supabase
      .from('orders')
      .select(`${ORDER_SELECT}, waiters(full_name, waiter_id)`)
      .eq('restaurant_id', restaurantId)
      .in('session_id', group)
      .neq('status', 'cancelled')
    if (res.error) {
      const fallback = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', restaurantId)
        .in('session_id', group)
        .neq('status', 'cancelled')
      if (fallback.error) {
        error = fallback.error
        break
      }
      rows.push(...(fallback.data || []))
      continue
    }
    rows.push(...(res.data || []))
  }
  return { data: rows, error }
}

async function loadPayments(restaurantId, fromISO, toISO) {
  const { data, error } = await applyDate(
    supabase
      .from('payments')
      .select('id, restaurant_id, session_id, bill_id, payment_method, amount, payment_reference, paid_at, created_at')
      .eq('restaurant_id', restaurantId)
      .order('paid_at', { ascending: false }),
    'paid_at',
    fromISO,
    toISO,
  )
  if (!error) return { data: data || [], error: null }
  const fallback = await listRestaurantPayments(restaurantId)
  const fromTime = fromISO ? new Date(fromISO).getTime() : -Infinity
  const toTime = toISO ? new Date(toISO).getTime() : Infinity
  return {
    data: (fallback.data || []).filter((row) => {
      const time = new Date(row.paid_at || row.created_at).getTime()
      return time >= fromTime && time < toTime
    }),
    error: fallback.error,
  }
}

async function loadOrders(restaurantId, fromISO, toISO, withItems) {
  const select = withItems
    ? `${ORDER_SELECT}, order_items(${ORDER_ITEM_SELECT}), waiters(full_name, waiter_id)`
    : `${ORDER_SELECT}, waiters(full_name, waiter_id)`
  const { data, error } = await applyDate(
    supabase.from('orders').select(select).eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
    'created_at',
    fromISO,
    toISO,
  )
  if (!error) return { data: data || [], error: null }
  const fallback = await listRestaurantOrders(restaurantId)
  const fromTime = fromISO ? new Date(fromISO).getTime() : -Infinity
  const toTime = toISO ? new Date(toISO).getTime() : Infinity
  return {
    data: (fallback.data || []).filter((row) => {
      const time = new Date(row.created_at).getTime()
      return time >= fromTime && time < toTime
    }),
    error: fallback.error,
  }
}

async function loadKots(restaurantId, fromISO, toISO) {
  const { data, error } = await applyDate(
    supabase
      .from('kots')
      .select(`${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT}), orders(${ORDER_SELECT}, waiters(full_name, waiter_id))`)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }),
    'created_at',
    fromISO,
    toISO,
  )
  if (!error) return { data: data || [], error: null }
  const fallback = await supabase
    .from('kots')
    .select(`${KOT_SELECT}, kot_items(${KOT_ITEM_SELECT})`)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(ROW_CAP)
  const fromTime = fromISO ? new Date(fromISO).getTime() : -Infinity
  const toTime = toISO ? new Date(toISO).getTime() : Infinity
  return {
    data: (fallback.data || []).filter((row) => {
      const time = new Date(row.created_at).getTime()
      return time >= fromTime && time < toTime
    }),
    error: fallback.error,
  }
}

async function loadBillsByIds(restaurantId, ids) {
  const select =
    'id, restaurant_id, session_id, bill_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, grand_total, status, created_at, updated_at'
  const { data, error } = await loadByIds('bills', select, restaurantId, ids)
  if (!error) return { data, error: null }
  const fallback = await listRestaurantBills(restaurantId)
  const wanted = new Set(ids)
  return { data: (fallback.data || []).filter((bill) => wanted.has(bill.id)), error: fallback.error }
}

async function loadOutstandingBills(restaurantId) {
  const { data, error } = await supabase
    .from('bills')
    .select('id, restaurant_id, session_id, bill_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, grand_total, status, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .in('status', ['open', 'payment_pending'])
    .order('created_at', { ascending: true })
    .limit(ROW_CAP)
  if (!error) return { data: data || [], error: null }
  const fallback = await listRestaurantBills(restaurantId)
  return {
    data: (fallback.data || []).filter((bill) => bill.status === 'open' || bill.status === 'payment_pending'),
    error: fallback.error,
  }
}

async function loadBillPayments(restaurantId, billIds) {
  if (!billIds.length) return { data: [], error: null }
  const select = 'id, restaurant_id, session_id, bill_id, payment_method, amount, payment_reference, paid_at, created_at'
  const rows = []
  let error = null
  for (const group of chunks(billIds, 200)) {
    const res = await supabase.from('payments').select(select).eq('restaurant_id', restaurantId).in('bill_id', group)
    if (res.error) {
      error = res.error
      break
    }
    rows.push(...(res.data || []))
  }
  if (!error) return { data: rows, error: null }
  const fallback = await listRestaurantPayments(restaurantId)
  const wanted = new Set(billIds)
  return { data: (fallback.data || []).filter((row) => wanted.has(row.bill_id)), error: fallback.error }
}

export async function loadAnalyticsData(restaurantId, reportType, range) {
  if (!restaurantId) return { data: null, error: null, capped: false }
  const needs = new Set(TYPE_NEEDS[reportType] || TYPE_NEEDS.collections)
  const fromISO = range?.fromISO || null
  const toISO = range?.toISO || null

  const lookups = await Promise.all([listTables(restaurantId), listWaiters(restaurantId)])
  const tables = lookups[0].data || []
  const waiters = lookups[1].data || []
  const firstError = lookups.find((row) => row.error)?.error || null

  let payments = []
  let bills = []
  let orders = []
  let kots = []
  let categories = []
  let menuItems = []
  let error = firstError
  let capped = false

  if (needs.has('categories')) {
    const res = await listCategories(restaurantId)
    categories = res.data || []
    error = error || res.error
  }
  if (needs.has('menuItems')) {
    const res = await listMenuItems(restaurantId)
    menuItems = res.data || []
    error = error || res.error
  }
  if (needs.has('payments')) {
    const res = await loadPayments(restaurantId, fromISO, toISO)
    payments = res.data || []
    capped = capped || payments.length >= ROW_CAP
    error = error || res.error
  }
  if (needs.has('orders')) {
    const res = await loadOrders(restaurantId, fromISO, toISO, true)
    orders = res.data || []
    capped = capped || orders.length >= ROW_CAP
    error = error || res.error
  }
  if (needs.has('kots')) {
    const res = await loadKots(restaurantId, fromISO, toISO)
    kots = res.data || []
    capped = capped || kots.length >= ROW_CAP
    error = error || res.error
  }

  if (needs.has('bills') && reportType === 'outstanding') {
    const res = await loadOutstandingBills(restaurantId)
    bills = res.data || []
    error = error || res.error
    const extra = await loadBillPayments(restaurantId, uniqueIds(bills, 'id'))
    payments = extra.data || []
    error = error || extra.error
  } else if (needs.has('bills')) {
    const res = await loadBillsByIds(restaurantId, uniqueIds(payments, 'bill_id'))
    bills = res.data || []
    error = error || res.error
  }

  const sessionIds = uniqueIds([...payments, ...bills, ...orders, ...kots], 'session_id')
  const sessionsRes = needs.has('sessions') ? await loadSessions(restaurantId, sessionIds) : { data: [], error: null }
  error = error || sessionsRes.error

  if (needs.has('ordersLite') && !needs.has('orders')) {
    const sessionOrders = await loadOrdersForSessions(restaurantId, sessionIds)
    error = error || sessionOrders.error
    orders = sessionOrders.data || []
  }

  if (error && String(error.message || '').toLowerCase().includes('not allowed')) {
    return { data: null, error: { message: 'Only the restaurant owner can view reports.' }, capped: false }
  }

  return {
    data: {
      tables,
      waiters,
      payments,
      bills,
      orders,
      kots,
      sessions: sessionsRes.data || [],
      categories,
      menuItems,
    },
    error: error && !(payments.length || bills.length || orders.length || kots.length) ? { message: 'Unable to load report data. Please try again.' } : null,
    capped,
  }
}
