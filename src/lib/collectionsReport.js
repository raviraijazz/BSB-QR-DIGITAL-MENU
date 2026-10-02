import { moneyRound } from './orderCart'
import { localDayKeyFromInstant } from './reportDates'

export const REPORT_METHODS = [
  { method: 'cash', label: 'Cash' },
  { method: 'upi', label: 'UPI' },
  { method: 'card', label: 'Card' },
]

function statusMatches(status, filter) {
  if (filter === 'settled') return status === 'paid'
  if (filter === 'partial') return status === 'payment_pending'
  if (filter === 'open') return status === 'open'
  return true
}

function matchesSearch(parts, search) {
  const needle = String(search || '').trim().toLowerCase()
  if (!needle) return true
  return parts.filter(Boolean).join(' ').toLowerCase().includes(needle)
}

function normalizeTables(list) {
  const rows = (list || []).filter((table) => table?.id)
  const seen = new Set()
  const out = []
  for (const table of rows) {
    if (seen.has(table.id)) continue
    seen.add(table.id)
    out.push({ id: table.id, table_number: table.table_number, name: table.name })
  }
  return out
}

export function sessionTableRowLabel(tables) {
  const rows = normalizeTables(tables)
  if (!rows.length) return 'Table'
  if (rows.length === 1) {
    const table = rows[0]
    const number = String(table.table_number || '').trim()
    return number ? (/^table(\s|$)/i.test(number) ? number : `Table ${number}`) : table.name || 'Table'
  }
  return `Tables ${rows.map((table) => String(table.table_number || table.name || '?').replace(/^table\s*/i, '')).join(' + ')}`
}

export function billMethodsSummary(payments) {
  const rows = payments || []
  const totals = {}
  for (const row of rows) {
    const key = row.method || row.payment_method
    totals[key] = moneyRound((totals[key] || 0) + (Number(row.amount) || 0))
  }
  return REPORT_METHODS.filter((item) => totals[item.method]).map((item) => ({ ...item, amount: totals[item.method] }))
}

export function buildReportFromData(data, params = {}) {
  const {
    from,
    to,
    tzOffsetMinutes = 0,
    status = 'all',
    method = null,
    waiterId = null,
    tableId = null,
    search = '',
    limit = 200,
    offset = 0,
  } = params

  const bills = data.bills || []
  const payments = data.payments || []
  const tables = data.tables || []
  const waiters = data.waiters || []
  const sessions = data.sessions || []
  const orders = data.orders || []

  const tableById = Object.fromEntries(tables.map((table) => [table.id, table]))
  const waiterById = Object.fromEntries(waiters.map((waiter) => [waiter.id, waiter]))
  const billById = Object.fromEntries(bills.map((bill) => [bill.id, bill]))

  const ordersBySession = new Map()
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    if (!ordersBySession.has(order.session_id)) ordersBySession.set(order.session_id, [])
    ordersBySession.get(order.session_id).push(order)
  }

  const paymentsByBill = new Map()
  for (const payment of payments) {
    if (!payment.bill_id) continue
    if (!paymentsByBill.has(payment.bill_id)) paymentsByBill.set(payment.bill_id, [])
    paymentsByBill.get(payment.bill_id).push(payment)
  }

  const sessionInfo = (sessionId) => {
    const session = sessions.find((row) => row.id === sessionId)
    if (!session) return null
    const linked = Array.isArray(session.session_tables)
      ? session.session_tables.map((row) => tableById[row.table_id]).filter(Boolean)
      : []
    const primary = tableById[session.primary_table_id]
    const grouped = normalizeTables(linked.length ? linked : primary ? [primary] : [])
    const sessionOrders = (ordersBySession.get(sessionId) || [])
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const waiter = sessionOrders[0]?.waiter_id ? waiterById[sessionOrders[0].waiter_id] : null
    return {
      session_id: session.id,
      session_number: session.session_number,
      started_at: session.started_at,
      primary_table_id: session.primary_table_id,
      waiter_id: waiter?.id || null,
      waiter_name: waiter?.full_name || null,
      waiter_code: waiter?.waiter_id || null,
      tables: grouped,
    }
  }

  const sessionCache = new Map()
  const getSession = (sessionId) => {
    if (!sessionCache.has(sessionId)) sessionCache.set(sessionId, sessionInfo(sessionId))
    return sessionCache.get(sessionId)
  }

  const fromTime = from ? new Date(from).getTime() : -Infinity
  const toTime = to ? new Date(to).getTime() : Infinity

  const passesScope = (meta) => {
    if (!meta) return !waiterId && !tableId
    if (waiterId && meta.waiter_id !== waiterId) return false
    if (tableId && meta.primary_table_id !== tableId && !meta.tables.some((table) => table.id === tableId)) return false
    return true
  }

  const filteredPayments = []
  for (const payment of payments) {
    const bill = billById[payment.bill_id]
    if (!bill || bill.status === 'cancelled') continue
    const time = new Date(payment.paid_at || payment.created_at).getTime()
    if (time < fromTime || time >= toTime) continue
    if (method && payment.payment_method !== method) continue
    if (!statusMatches(bill.status, status)) continue
    const meta = getSession(payment.session_id)
    if (!passesScope(meta)) continue
    if (!matchesSearch([bill.bill_number, meta?.session_number], search)) continue
    filteredPayments.push(payment)
  }

  const summary = { total: 0, cash: 0, upi: 0, card: 0, payment_count: filteredPayments.length }
  const methodTotals = Object.fromEntries(REPORT_METHODS.map((row) => [row.method, { amount: 0, count: 0 }]))
  const dayTotals = new Map()
  const hourTotals = new Map()
  const collectedByWaiter = new Map()
  const collectedByTable = new Map()

  for (const payment of filteredPayments) {
    const amount = moneyRound(payment.amount)
    summary.total = moneyRound(summary.total + amount)
    if (summary[payment.payment_method] != null) summary[payment.payment_method] = moneyRound(summary[payment.payment_method] + amount)
    if (methodTotals[payment.payment_method]) {
      methodTotals[payment.payment_method].amount = moneyRound(methodTotals[payment.payment_method].amount + amount)
      methodTotals[payment.payment_method].count += 1
    }
    const day = localDayKeyFromInstant(payment.paid_at || payment.created_at, tzOffsetMinutes)
    const dayRow = dayTotals.get(day) || { amount: 0, count: 0 }
    dayRow.amount = moneyRound(dayRow.amount + amount)
    dayRow.count += 1
    dayTotals.set(day, dayRow)

    const instant = payment.paid_at || payment.created_at
    const localHour = new Date(new Date(instant).getTime() + Number(tzOffsetMinutes || 0) * 60000).getUTCHours()
    const hourRow = hourTotals.get(localHour) || { amount: 0, count: 0 }
    hourRow.amount = moneyRound(hourRow.amount + amount)
    hourRow.count += 1
    hourTotals.set(localHour, hourRow)

    const meta = getSession(payment.session_id)
    if (meta?.waiter_id) collectedByWaiter.set(meta.waiter_id, moneyRound((collectedByWaiter.get(meta.waiter_id) || 0) + amount))
    if (meta?.primary_table_id) collectedByTable.set(meta.primary_table_id, moneyRound((collectedByTable.get(meta.primary_table_id) || 0) + amount))
  }

  const billsWithPayments = new Set(filteredPayments.map((payment) => payment.bill_id))

  const billRows = bills
    .filter((bill) => bill.status !== 'cancelled' && billsWithPayments.has(bill.id) && statusMatches(bill.status, status))
    .map((bill) => {
      const meta = getSession(bill.session_id) || {}
      const billPayments = (paymentsByBill.get(bill.id) || [])
        .slice()
        .sort((a, b) => new Date(a.paid_at || a.created_at) - new Date(b.paid_at || b.created_at))
      const settledAt = billPayments.length ? billPayments[billPayments.length - 1].paid_at || billPayments[billPayments.length - 1].created_at : null
      const paid = moneyRound(billPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))
      return {
        bill_id: bill.id,
        bill_number: bill.bill_number,
        status: bill.status,
        subtotal: Number(bill.subtotal) || 0,
        discount_amount: Number(bill.discount_amount) || 0,
        grand_total: Number(bill.grand_total) || 0,
        session_id: bill.session_id,
        session_number: meta.session_number || null,
        started_at: meta.started_at || null,
        primary_table_id: meta.primary_table_id || null,
        waiter_id: meta.waiter_id || null,
        waiter_name: meta.waiter_name || null,
        waiter_code: meta.waiter_code || null,
        tables: meta.tables || [],
        settled_at: settledAt,
        paid,
        payments: billPayments.map((row) => ({
          method: row.payment_method,
          amount: Number(row.amount) || 0,
          paid_at: row.paid_at || row.created_at,
          reference: row.payment_reference || '',
        })),
      }
    })
    .sort((a, b) => new Date(b.settled_at || 0) - new Date(a.settled_at || 0))

  const billsTotal = billRows.length
  const billsDisplay = billRows.slice(offset, offset + limit)

  const gross = moneyRound(billRows.reduce((sum, row) => sum + row.subtotal, 0))
  const discount = moneyRound(billRows.reduce((sum, row) => sum + row.discount_amount, 0))
  const payable = moneyRound(billRows.reduce((sum, row) => sum + row.grand_total, 0))
  const settledBills = billRows.filter((row) => row.status === 'paid').length
  const settledPayable = moneyRound(billRows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.grand_total, 0))
  const settledCollected = moneyRound(
    filteredPayments.reduce((sum, payment) => (billById[payment.bill_id]?.status === 'paid' ? sum + (Number(payment.amount) || 0) : sum), 0),
  )

  const waiterGroups = new Map()
  for (const row of billRows) {
    const key = row.waiter_id || 'unassigned'
    const group = waiterGroups.get(key) || { waiter_id: row.waiter_id, name: row.waiter_name, waiter_code: row.waiter_code, bills: 0, gross: 0, discount: 0, payable: 0, collected: 0 }
    group.bills += 1
    group.gross = moneyRound(group.gross + row.subtotal)
    group.discount = moneyRound(group.discount + row.discount_amount)
    group.payable = moneyRound(group.payable + row.grand_total)
    group.collected = collectedByWaiter.get(row.waiter_id) || 0
    waiterGroups.set(key, group)
  }

  const tableGroups = new Map()
  for (const row of billRows) {
    const key = row.primary_table_id || 'none'
    const group = tableGroups.get(key) || { table_id: row.primary_table_id, table_number: tableById[row.primary_table_id]?.table_number || null, name: tableById[row.primary_table_id]?.name || null, bills: 0, merged_bills: 0, gross: 0, discount: 0, payable: 0, collected: 0 }
    group.bills += 1
    if ((row.tables || []).length > 1) group.merged_bills += 1
    group.gross = moneyRound(group.gross + row.subtotal)
    group.discount = moneyRound(group.discount + row.discount_amount)
    group.payable = moneyRound(group.payable + row.grand_total)
    group.collected = collectedByTable.get(row.primary_table_id) || 0
    tableGroups.set(key, group)
  }

  const outstanding = bills
    .filter((bill) => bill.status === 'open' || bill.status === 'payment_pending')
    .map((bill) => {
      const meta = getSession(bill.session_id) || {}
      const billPayments = paymentsByBill.get(bill.id) || []
      const paid = moneyRound(billPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))
      const remaining = moneyRound(Math.max(0, (Number(bill.grand_total) || 0) - paid))
      return {
        bill_id: bill.id,
        bill_number: bill.bill_number,
        status: bill.status,
        subtotal: Number(bill.subtotal) || 0,
        discount_amount: Number(bill.discount_amount) || 0,
        grand_total: Number(bill.grand_total) || 0,
        paid,
        remaining,
        session_id: bill.session_id,
        session_number: meta.session_number || null,
        started_at: meta.started_at || null,
        primary_table_id: meta.primary_table_id || null,
        waiter_id: meta.waiter_id || null,
        waiter_name: meta.waiter_name || null,
        waiter_code: meta.waiter_code || null,
        tables: meta.tables || [],
      }
    })
    .filter((row) => {
      if (waiterId && row.waiter_id !== waiterId) return false
      if (tableId && row.primary_table_id !== tableId && !(row.tables || []).some((table) => table.id === tableId)) return false
      return matchesSearch([row.bill_number, row.session_number], search)
    })
    .sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0))

  const outstandingTotal = moneyRound(outstanding.reduce((sum, row) => sum + row.remaining, 0))

  return {
    source: 'fallback',
    range: { from, to, tz_offset_minutes: tzOffsetMinutes },
    summary: {
      total: summary.total,
      cash: summary.cash,
      upi: summary.upi,
      card: summary.card,
      payment_count: summary.payment_count,
      settled_bills: settledBills,
      bills: billsTotal,
      gross,
      discount,
      payable,
      settled_payable: settledPayable,
      settled_collected: settledCollected,
      outstanding: outstandingTotal,
    },
    by_method: REPORT_METHODS.map((row) => ({ method: row.method, label: row.label, amount: methodTotals[row.method].amount, count: methodTotals[row.method].count })),
    by_day: [...dayTotals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, row]) => ({ day, amount: row.amount, count: row.count })),
    by_hour: [...hourTotals.entries()].sort((a, b) => a[0] - b[0]).map(([hour, row]) => ({ hour, amount: row.amount, count: row.count })),
    by_waiter: [...waiterGroups.values()].sort((a, b) => b.gross - a.gross),
    by_table: [...tableGroups.values()].sort((a, b) => b.gross - a.gross),
    bills: billsDisplay,
    bills_total: billsTotal,
    outstanding_bills: outstanding,
  }
}
