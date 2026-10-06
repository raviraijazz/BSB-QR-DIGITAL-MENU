import { firstRelated, kotTypeLabel, moneyRound, paymentMethodLabel, paymentsTotal, remainingBalance } from './orderCart'
import { compactTableLabel, sessionTablesLabel, tableHeading, uniqueTables } from './tableToken'
import { tablesForSession } from '../services/tableMoves'
import { orderSubtotal } from '../services/waiterOrders'
import { buildRange } from './reportDates'

export const HISTORY_PAGE_SIZE = 10
export const HISTORY_EXPORT_LIMIT = 5000

export const HISTORY_RANGE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
]

export const QUICK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'partial', label: 'Partially Paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const ORDER_STATUS_OPTIONS = [
  { id: 'new', label: 'New' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'served', label: 'Served' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const KOT_STATUS_OPTIONS = [
  { id: 'new', label: 'New' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'served', label: 'Served' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const BILL_STATUS_OPTIONS = [
  { id: 'open', label: 'Open' },
  { id: 'payment_pending', label: 'Partially Paid' },
  { id: 'paid', label: 'Settled' },
  { id: 'cancelled', label: 'Voided' },
]

export const PAYMENT_STATE_OPTIONS = [
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'partial', label: 'Partially Paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'voided', label: 'Voided' },
]

export const ORDER_TYPE_OPTIONS = [{ id: 'dine_in', label: 'Dine-in' }]

export function restaurantTimeZone(restaurant) {
  return String(restaurant?.timezone || restaurant?.time_zone || restaurant?.tz || '').trim()
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function wallParts(date, timeZone) {
  const options = {
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }
  if (timeZone) options.timeZone = timeZone
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date)
  const map = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return map
}

function zonedDateTimeToUtc(dateKey, hour, minute, timeZone) {
  let utc = Date.parse(`${dateKey}T${pad(hour)}:${pad(minute)}:00.000Z`)
  for (let i = 0; i < 4; i += 1) {
    const wall = wallParts(new Date(utc), timeZone)
    const wallKey = `${wall.year}-${wall.month}-${wall.day}T${wall.hour}:${wall.minute}`
    const target = `${dateKey}T${pad(hour)}:${pad(minute)}`
    utc += Date.parse(`${target}:00.000Z`) - Date.parse(`${wallKey}:00.000Z`)
  }
  return new Date(utc)
}

function addCalendarDays(dateKey, days, timeZone) {
  const noon = zonedDateTimeToUtc(dateKey, 12, 0, timeZone)
  const next = wallParts(new Date(noon.getTime() + days * 86400000), timeZone)
  return `${next.year}-${next.month}-${next.day}`
}

export function historyRange(preset, custom, restaurant) {
  const timeZone = restaurantTimeZone(restaurant)
  if (!timeZone) return buildRange(preset, custom)
  try {
    const todayParts = wallParts(new Date(), timeZone)
    const todayKey = `${todayParts.year}-${todayParts.month}-${todayParts.day}`
    let fromKey = todayKey
    let lastKey = todayKey
    if (preset === 'yesterday') {
      fromKey = addCalendarDays(todayKey, -1, timeZone)
      lastKey = fromKey
    } else if (preset === 'week') {
      const names = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date())
      fromKey = addCalendarDays(todayKey, -(names[weekday] || 0), timeZone)
    } else if (preset === 'month') {
      fromKey = `${todayKey.slice(0, 8)}01`
    } else if (preset === 'custom') {
      fromKey = custom?.from || todayKey
      lastKey = custom?.to || custom?.from || todayKey
      if (lastKey < fromKey) lastKey = fromKey
    }
    return {
      id: preset || 'today',
      label: HISTORY_RANGE_PRESETS.find((row) => row.id === preset)?.label || 'Today',
      from: zonedDateTimeToUtc(fromKey, 0, 0, timeZone),
      to: zonedDateTimeToUtc(addCalendarDays(lastKey, 1, timeZone), 0, 0, timeZone),
    }
  } catch {
    return buildRange(preset, custom)
  }
}

export function relatedOne(value) {
  return firstRelated(value)
}

export function orderKots(order) {
  const rows = order?.kots
  if (Array.isArray(rows)) return rows.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  return rows ? [rows] : []
}

export function orderTypeLabel() {
  return 'Dine-in'
}

export function paymentState(bill, payments) {
  if (bill?.status === 'cancelled') return 'voided'
  if (bill?.status === 'paid') return 'paid'
  if (bill?.status === 'payment_pending' || (payments || []).length) return 'partial'
  return 'unpaid'
}

export function paymentStateLabel(state) {
  if (state === 'paid') return 'Paid'
  if (state === 'partial') return 'Partially Paid'
  if (state === 'voided') return 'Voided'
  return 'Unpaid'
}

export function historyStatus(order, bill) {
  if (order?.status === 'cancelled') return 'cancelled'
  if (bill?.status === 'cancelled') return 'voided'
  if (bill?.status === 'paid') return 'completed'
  if (bill?.status === 'payment_pending') return 'partial'
  if (order?.status === 'ready') return 'ready'
  if (order?.status === 'preparing' || order?.status === 'accepted') return 'preparing'
  if (order?.status === 'served') return 'completed'
  return 'open'
}

export function historyStatusLabel(status) {
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'voided') return 'Voided'
  if (status === 'completed') return 'Completed'
  if (status === 'partial') return 'Partially Paid'
  if (status === 'ready') return 'Ready'
  if (status === 'preparing') return 'Preparing'
  if (status === 'paid') return 'Paid'
  return 'Open'
}

export function statusTone(status) {
  if (status === 'unpaid' || status === 'cancelled' || status === 'voided') {
    return 'bg-rose-50 text-rose-600'
  }
  if (status === 'partial' || status === 'payment_pending') {
    return 'bg-rose-50 text-rose-500'
  }
  if (status === 'preparing' || status === 'accepted' || status === 'new') {
    return 'bg-amber-50 text-amber-800'
  }
  return 'bg-emerald-50 text-emerald-700'
}

export function formatHistoryDate(value, restaurant) {
  if (!value) return '—'
  const timeZone = restaurantTimeZone(restaurant)
  const options = { day: '2-digit', month: 'short', year: 'numeric' }
  try {
    return new Date(value).toLocaleDateString('en-GB', timeZone ? { ...options, timeZone } : options)
  } catch {
    try {
      return new Date(value).toLocaleDateString('en-GB', options)
    } catch {
      return '—'
    }
  }
}

export function formatHistoryTime(value, restaurant) {
  if (!value) return '—'
  const timeZone = restaurantTimeZone(restaurant)
  const options = { hour: 'numeric', minute: '2-digit' }
  try {
    return new Date(value).toLocaleTimeString('en-US', timeZone ? { ...options, timeZone } : options)
  } catch {
    try {
      return new Date(value).toLocaleTimeString('en-US', options)
    } catch {
      return '—'
    }
  }
}

export function formatHistoryDateTime(value, restaurant) {
  if (!value) return '—'
  return `${formatHistoryDate(value, restaurant)} · ${formatHistoryTime(value, restaurant)}`
}

export function historyRangeLabel(range, restaurant) {
  if (!range?.from || !range?.to) return ''
  const last = new Date(range.to.getTime() - 1)
  const from = formatHistoryDate(range.from, restaurant)
  const to = formatHistoryDate(last, restaurant)
  return from === to ? from : `${from} – ${to}`
}

export function historyDateKey(value, restaurant) {
  const timeZone = restaurantTimeZone(restaurant)
  try {
    const parts = wallParts(new Date(value), timeZone)
    if (parts.year && parts.month && parts.day) return `${parts.year}-${parts.month}-${parts.day}`
  } catch {
    /* local fallback */
  }
  return localDateKeyFallback(value)
}

function localDateKeyFallback(value) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatHistoryClock(value, restaurant) {
  return formatHistoryTime(value, restaurant)
}

export function historyWaiterName(waiter) {
  return waiter?.full_name || waiter?.waiter_id || 'Waiter'
}

export function historyTableShort(sessionTables, sourceTable) {
  const rows = uniqueTables(sessionTables?.length ? sessionTables : sourceTable ? [sourceTable] : [])
  if (!rows.length) return 'Table'
  return rows
    .map((table) => {
      const compact = compactTableLabel(table)
      return /^table(\s|$)/i.test(compact) ? compact : `Table ${compact}`
    })
    .join(' + ')
}

export function sessionStatusLabel(status) {
  const value = String(status || 'active')
  if (value === 'closed') return 'Closed'
  if (value === 'bill_requested') return 'Bill requested'
  if (value === 'payment_pending') return 'Payment pending'
  if (value === 'cancelled') return 'Cancelled'
  return 'Open'
}

export function pageNumbers(page, pages) {
  const total = Math.max(1, pages)
  const current = Math.min(Math.max(1, page + 1), total)
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const items = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) items.push('…')
  for (let n = start; n <= end; n += 1) items.push(n)
  if (end < total - 1) items.push('…')
  items.push(total)
  return items
}

export function itemVariant(item) {
  return String(item?.description || '').trim()
}

export function itemCount(order) {
  return (order?.order_items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
}

export function matchesQuickFilter(row, filter) {
  if (!filter || filter === 'all') return true
  if (filter === 'cancelled') return row.order.status === 'cancelled' || row.status === 'cancelled'
  if (filter === 'paid') return row.bill?.status === 'paid' || row.paymentState === 'paid'
  if (filter === 'partial') return row.paymentState === 'partial'
  if (filter === 'completed') return row.status === 'completed' || row.order.status === 'served'
  if (filter === 'ready') return row.order.status === 'ready' || row.kots.some((kot) => kot.status === 'ready')
  if (filter === 'preparing') {
    return row.order.status === 'preparing' || row.order.status === 'accepted' || row.kots.some((kot) => kot.status === 'preparing')
  }
  if (filter === 'open') {
    return row.order.status !== 'cancelled' && row.bill?.status !== 'paid' && row.bill?.status !== 'cancelled'
  }
  return true
}

export function uniquePayments(rows) {
  const seen = new Set()
  const list = []
  for (const row of rows || []) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    list.push(row)
  }
  return list.sort((a, b) => new Date(a.paid_at || a.created_at) - new Date(b.paid_at || b.created_at))
}

export function buildHistoryRow(order, tables, billsBySession, paymentsByBill) {
  const session = relatedOne(order.table_sessions) || null
  const waiter = relatedOne(order.waiters) || null
  const sessionTables = tablesForSession(tables, session)
  const sourceTable = (tables || []).find((table) => table.id === order.source_table_id) || null
  const tableLabel = historyTableShort(sessionTables, sourceTable)
  const tableHeadingLabel = sessionTables.length
    ? sessionTablesLabel(sessionTables)
    : sourceTable
      ? tableHeading(sourceTable)
      : tableLabel
  const bill = (session?.id && billsBySession?.[session.id]) || relatedOne(session?.bills) || null
  const payments = uniquePayments(bill?.id ? paymentsByBill?.[bill.id] || session?.payments || [] : [])
  const kots = orderKots(order)
  const subtotal = moneyRound(orderSubtotal(order.order_items))
  const paid = paymentsTotal(payments)
  const payable = moneyRound(bill?.grand_total)
  return {
    order,
    session,
    waiter,
    sessionTables,
    sourceTable,
    tableLabel,
    tableHeadingLabel,
    bill,
    payments,
    kots,
    kot: kots[0] || null,
    itemCount: itemCount(order),
    subtotal,
    paid,
    payable,
    remaining: bill ? remainingBalance(payable, payments) : subtotal,
    paymentState: paymentState(bill, payments),
    status: historyStatus(order, bill),
    orderType: orderTypeLabel(),
  }
}

export function billSnapshotRows(bill, payments) {
  if (!bill) {
    return {
      subtotal: 0,
      discount: 0,
      taxable: 0,
      tax: 0,
      taxLabel: 'Tax',
      service: 0,
      payable: 0,
      paid: paymentsTotal(payments),
      remaining: 0,
    }
  }
  const tax = moneyRound((Number(bill.cgst_amount) || 0) + (Number(bill.sgst_amount) || 0))
  const taxable = moneyRound(bill.taxable_amount)
  const rate = taxable > 0 && tax > 0 ? Math.round((tax / taxable) * 100) : 0
  const payable = moneyRound(bill.grand_total)
  return {
    subtotal: moneyRound(bill.subtotal),
    discount: moneyRound(bill.discount_amount),
    taxable,
    tax,
    taxLabel: rate > 0 && rate <= 28 ? `GST (${rate}%)` : 'Tax',
    service: moneyRound(bill.other_tax_amount),
    payable,
    paid: paymentsTotal(payments),
    remaining: remainingBalance(payable, payments),
  }
}

export function historyTimeline(row) {
  const events = []
  if (row.session?.started_at) {
    events.push({ id: `session-start-${row.session.id}`, at: row.session.started_at, title: 'Session started', detail: row.tableLabel })
  }
  if (row.order?.created_at) {
    events.push({
      id: `order-${row.order.id}`,
      at: row.order.created_at,
      title: 'Order created',
      detail: `Order #${row.order.order_number}`,
    })
  }
  for (const kot of row.kots || []) {
    events.push({
      id: `kot-${kot.id}`,
      at: kot.created_at,
      title: 'KOT created',
      detail: `KOT #${kot.kot_number} · ${kotTypeLabel(kot.kot_type)}`,
    })
    if (kot.printed_at) {
      events.push({
        id: `kot-print-${kot.id}`,
        at: kot.printed_at,
        title: 'KOT printed',
        detail: `KOT #${kot.kot_number}`,
      })
    }
  }
  if (row.bill?.created_at) {
    events.push({
      id: `bill-${row.bill.id}`,
      at: row.bill.created_at,
      title: `Bill ${row.bill.bill_number || ''} created`.trim(),
      detail: row.bill.discount_amount ? `Discount applied` : undefined,
    })
  }
  ;(row.payments || []).forEach((payment, index) => {
    events.push({
      id: `pay-${payment.id}`,
      at: payment.paid_at || payment.created_at,
      title: index === 0 ? `${paymentMethodLabel(payment.payment_method)} payment` : `Additional ${paymentMethodLabel(payment.payment_method)} payment`,
      detail: payment.payment_reference || undefined,
    })
  })
  if (row.bill?.status === 'paid' && row.session?.closed_at) {
    events.push({
      id: `bill-settled-${row.bill.id}`,
      at: row.session.closed_at,
      title: 'Bill settled',
      detail: row.bill.bill_number || undefined,
    })
  }
  if (row.session?.closed_at) {
    events.push({
      id: `session-close-${row.session.id}`,
      at: row.session.closed_at,
      title: 'Session closed',
      detail: row.session.session_number || undefined,
    })
  }
  return events
    .filter((event) => event.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at) || String(a.id).localeCompare(String(b.id)))
}

export function waiterSummary(rows) {
  return {
    orders: (rows || []).length,
    orderValue: moneyRound((rows || []).reduce((sum, row) => sum + row.subtotal, 0)),
    settledValue: moneyRound((rows || []).reduce((sum, row) => sum + (row.bill?.status === 'paid' ? row.payable : 0), 0)),
  }
}

export function emptyHistoryFilters() {
  return {
    rangePreset: 'today',
    customFrom: '',
    customTo: '',
    quick: 'all',
    orderStatus: '',
    kotStatus: '',
    billStatus: '',
    waiterId: '',
    tableId: '',
    paymentMethod: '',
    orderType: '',
    sessionId: '',
    paymentState: '',
    search: '',
  }
}

