import { billStatusLabel, moneyRound, paymentMethodLabel } from './orderCart'
import { sessionTableRowLabel } from './collectionsReport'
import {
  COLUMN_DEFS,
  MEASURES,
  allowedColumns,
  allowedGroups,
  allowedMeasures,
  emptyAnalyticsFilters,
  reportDefaults,
} from './analyticsCatalog'
import {
  formatDayLabel,
  formatMonthLabel,
  formatReportDateTime,
  hourLabel,
  localDayKeyFromInstant,
  localMonthKeyFromInstant,
} from './reportDates'

const MEASURE_IDS = MEASURES.map((row) => row.id)
const MEASURE_KIND = Object.fromEntries(MEASURES.map((row) => [row.id, row.kind]))

function firstRelated(value) {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
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

function tableLabel(tables) {
  return sessionTableRowLabel(tables)
}

function waiterLabel(waiter) {
  if (!waiter) return 'Unassigned'
  return waiter.full_name || waiter.waiter_id || 'Unassigned'
}

function matchesSearch(parts, search) {
  const needle = String(search || '').trim().toLowerCase()
  if (!needle) return true
  return parts.filter(Boolean).join(' ').toLowerCase().includes(needle)
}

function localHour(value, offsetMinutes) {
  return new Date(new Date(value).getTime() + Number(offsetMinutes || 0) * 60000).getUTCHours()
}

function methodAmounts(payments) {
  const cash = moneyRound((payments || []).reduce((sum, row) => (row.method === 'cash' || row.payment_method === 'cash' ? sum + (Number(row.amount) || 0) : sum), 0))
  const upi = moneyRound((payments || []).reduce((sum, row) => (row.method === 'upi' || row.payment_method === 'upi' ? sum + (Number(row.amount) || 0) : sum), 0))
  const card = moneyRound((payments || []).reduce((sum, row) => (row.method === 'card' || row.payment_method === 'card' ? sum + (Number(row.amount) || 0) : sum), 0))
  return { cash, upi, card, paid: moneyRound(cash + upi + card) }
}

function emptyBag() {
  return {
    gross: 0,
    discount: 0,
    net: 0,
    paid: 0,
    outstanding: 0,
    cash: 0,
    upi: 0,
    card: 0,
    itemQty: 0,
    paymentCount: 0,
    _bills: new Set(),
    _orders: new Set(),
    _payments: new Set(),
  }
}

function addBag(bag, fact) {
  bag.gross = moneyRound(bag.gross + (Number(fact.gross) || 0))
  bag.discount = moneyRound(bag.discount + (Number(fact.discount) || 0))
  bag.net = moneyRound(bag.net + (Number(fact.net) || 0))
  bag.paid = moneyRound(bag.paid + (Number(fact.paid) || 0))
  bag.outstanding = moneyRound(bag.outstanding + (Number(fact.outstanding) || 0))
  bag.cash = moneyRound(bag.cash + (Number(fact.cash) || 0))
  bag.upi = moneyRound(bag.upi + (Number(fact.upi) || 0))
  bag.card = moneyRound(bag.card + (Number(fact.card) || 0))
  bag.itemQty = moneyRound(bag.itemQty + (Number(fact.qty) || 0))
  bag.paymentCount += Number(fact.paymentCount) || 0
  if (fact.billId) bag._bills.add(fact.billId)
  if (fact.orderId) bag._orders.add(fact.orderId)
  if (fact.paymentId) bag._payments.add(fact.paymentId)
  for (const orderId of fact.orderIds || []) bag._orders.add(orderId)
  return bag
}

function finalizeBag(bag) {
  const billCount = bag._bills.size
  const orderCount = bag._orders.size
  const paymentCount = bag._payments.size || bag.paymentCount
  return {
    gross: bag.gross,
    discount: bag.discount,
    net: bag.net,
    paid: bag.paid,
    outstanding: bag.outstanding,
    cash: bag.cash,
    upi: bag.upi,
    card: bag.card,
    billCount,
    orderCount,
    paymentCount,
    itemQty: bag.itemQty,
    aov: orderCount ? moneyRound(bag.gross / orderCount) : 0,
    abv: billCount ? moneyRound(bag.net / billCount) : 0,
  }
}

export function buildLookups(data) {
  const tables = data.tables || []
  const waiters = data.waiters || []
  const sessions = data.sessions || []
  const bills = data.bills || []
  const orders = data.orders || []
  const payments = data.payments || []
  const categories = data.categories || []
  const menuItems = data.menuItems || []

  const tableById = Object.fromEntries(tables.map((table) => [table.id, table]))
  const waiterById = Object.fromEntries(waiters.map((waiter) => [waiter.id, waiter]))
  const billById = Object.fromEntries(bills.map((bill) => [bill.id, bill]))
  const billBySession = Object.fromEntries(bills.filter((bill) => bill.session_id).map((bill) => [bill.session_id, bill]))
  const categoryById = Object.fromEntries(categories.map((row) => [row.id, row]))
  const menuById = Object.fromEntries(menuItems.map((row) => [row.id, row]))

  const paymentsByBill = new Map()
  for (const payment of payments) {
    if (!payment.bill_id) continue
    if (!paymentsByBill.has(payment.bill_id)) paymentsByBill.set(payment.bill_id, [])
    paymentsByBill.get(payment.bill_id).push(payment)
  }

  const ordersBySession = new Map()
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    if (!ordersBySession.has(order.session_id)) ordersBySession.set(order.session_id, [])
    ordersBySession.get(order.session_id).push(order)
  }

  const sessionCache = new Map()
  function sessionMeta(sessionId) {
    if (sessionCache.has(sessionId)) return sessionCache.get(sessionId)
    const session = sessions.find((row) => row.id === sessionId)
    if (!session) {
      sessionCache.set(sessionId, null)
      return null
    }
    const linked = Array.isArray(session.session_tables)
      ? session.session_tables.map((row) => tableById[row.table_id]).filter(Boolean)
      : []
    const primary = tableById[session.primary_table_id]
    const grouped = normalizeTables(linked.length ? linked : primary ? [primary] : [])
    const sessionOrders = (ordersBySession.get(sessionId) || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const relatedWaiter = firstRelated(sessionOrders[0]?.waiters)
    const waiter = relatedWaiter || (sessionOrders[0]?.waiter_id ? waiterById[sessionOrders[0].waiter_id] : null)
    const meta = {
      session_id: session.id,
      session_number: session.session_number,
      started_at: session.started_at,
      primary_table_id: session.primary_table_id,
      waiter_id: waiter?.id || sessionOrders[0]?.waiter_id || null,
      waiter,
      tables: grouped,
      merged: grouped.length > 1,
    }
    sessionCache.set(sessionId, meta)
    return meta
  }

  return {
    tableById,
    waiterById,
    billById,
    billBySession,
    categoryById,
    menuById,
    paymentsByBill,
    ordersBySession,
    sessionMeta,
  }
}

function factBase(meta, extra = {}) {
  const tables = meta?.tables || []
  return {
    sessionId: meta?.session_id || null,
    session: meta?.session_number || '',
    tableId: meta?.primary_table_id || null,
    table: tableLabel(tables),
    tableIds: tables.map((table) => table.id),
    waiterId: meta?.waiter_id || extra.waiterId || null,
    waiter: waiterLabel(extra.waiter || meta?.waiter),
    merged: Boolean(meta?.merged),
    tables,
  }
}

export function buildFacts(type, data, params = {}) {
  const { tzOffsetMinutes = 0 } = params
  const lookups = buildLookups(data)
  const bills = data.bills || []
  const payments = data.payments || []
  const orders = data.orders || []
  const kots = data.kots || []
  const fromTime = params.from ? new Date(params.from).getTime() : -Infinity
  const toTime = params.to ? new Date(params.to).getTime() : Infinity

  if (type === 'payments') {
    return payments
      .filter((payment) => {
        const bill = lookups.billById[payment.bill_id]
        if (bill?.status === 'cancelled') return false
        const time = new Date(payment.paid_at || payment.created_at).getTime()
        return time >= fromTime && time < toTime
      })
      .map((payment) => {
        const bill = lookups.billById[payment.bill_id]
        const meta = lookups.sessionMeta(payment.session_id)
        const method = payment.payment_method || payment.method
        const amount = moneyRound(payment.amount)
        const at = payment.paid_at || payment.created_at
        return {
          id: payment.id,
          paymentId: payment.id,
          at,
          createdAt: at,
          settledAt: at,
          billId: bill?.id || payment.bill_id,
          billNo: bill?.bill_number || '',
          method,
          reference: payment.payment_reference || '',
          status: billStatusLabel(bill?.status),
          billStatus: bill?.status || '',
          gross: 0,
          discount: 0,
          net: 0,
          paid: amount,
          outstanding: 0,
          cash: method === 'cash' ? amount : 0,
          upi: method === 'upi' ? amount : 0,
          card: method === 'card' ? amount : 0,
          qty: 0,
          paymentCount: 1,
          ...factBase(meta),
        }
      })
  }

  if (type === 'sales') {
    return orders
      .filter((order) => {
        if (order.status === 'cancelled') return false
        const time = new Date(order.created_at).getTime()
        return time >= fromTime && time < toTime
      })
      .map((order) => {
        const items = order.order_items || []
        const gross = moneyRound(items.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0))
        const qty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        const meta = lookups.sessionMeta(order.session_id)
        const waiter = firstRelated(order.waiters) || lookups.waiterById[order.waiter_id]
        return {
          id: order.id,
          orderId: order.id,
          at: order.created_at,
          createdAt: order.created_at,
          orderNo: order.order_number || '',
          status: order.status || '',
          orderStatus: order.status || '',
          gross,
          discount: 0,
          net: gross,
          paid: 0,
          outstanding: 0,
          cash: 0,
          upi: 0,
          card: 0,
          qty,
          paymentCount: 0,
          ...factBase(meta, { waiter, waiterId: order.waiter_id }),
        }
      })
  }

  if (type === 'items') {
    const rows = []
    for (const order of orders) {
      if (order.status === 'cancelled') continue
      const time = new Date(order.created_at).getTime()
      if (time < fromTime || time >= toTime) continue
      const meta = lookups.sessionMeta(order.session_id)
      const waiter = firstRelated(order.waiters) || lookups.waiterById[order.waiter_id]
      for (const item of order.order_items || []) {
        const menu = lookups.menuById[item.menu_item_id]
        const category = lookups.categoryById[item.category_id || menu?.category_id]
        rows.push({
          id: item.id,
          orderId: order.id,
          at: order.created_at,
          createdAt: order.created_at,
          orderNo: order.order_number || '',
          itemId: item.menu_item_id || item.id,
          item: item.item_name || menu?.name || 'Item',
          categoryId: category?.id || menu?.category_id || '',
          category: category?.name || 'Uncategorised',
          status: order.status || '',
          orderStatus: order.status || '',
          gross: moneyRound(item.line_total),
          discount: 0,
          net: moneyRound(item.line_total),
          paid: 0,
          outstanding: 0,
          cash: 0,
          upi: 0,
          card: 0,
          qty: Number(item.quantity) || 0,
          paymentCount: 0,
          ...factBase(meta, { waiter, waiterId: order.waiter_id }),
        })
      }
    }
    return rows
  }

  if (type === 'kitchen') {
    return kots
      .filter((kot) => {
        const time = new Date(kot.created_at).getTime()
        return time >= fromTime && time < toTime
      })
      .map((kot) => {
        const order = firstRelated(kot.orders) || orders.find((row) => row.id === kot.order_id)
        const meta = lookups.sessionMeta(kot.session_id || order?.session_id)
        const waiter = firstRelated(order?.waiters) || lookups.waiterById[order?.waiter_id]
        const qty = (kot.kot_items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        return {
          id: kot.id,
          orderId: kot.order_id,
          at: kot.created_at,
          createdAt: kot.created_at,
          kotNo: kot.kot_number || '',
          orderNo: order?.order_number || '',
          kotType: kot.kot_type || 'new',
          status: kot.status || '',
          kotStatus: kot.status || '',
          orderStatus: order?.status || '',
          gross: 0,
          discount: 0,
          net: 0,
          paid: 0,
          outstanding: 0,
          cash: 0,
          upi: 0,
          card: 0,
          qty,
          paymentCount: 0,
          ...factBase(meta, { waiter, waiterId: order?.waiter_id }),
        }
      })
  }

  const billFacts = bills
    .filter((bill) => bill.status !== 'cancelled')
    .map((bill) => {
      const meta = lookups.sessionMeta(bill.session_id)
      const billPayments = (lookups.paymentsByBill.get(bill.id) || [])
        .slice()
        .sort((a, b) => new Date(a.paid_at || a.created_at) - new Date(b.paid_at || b.created_at))
      const inRange = billPayments.filter((payment) => {
        const time = new Date(payment.paid_at || payment.created_at).getTime()
        return time >= fromTime && time < toTime
      })
      const methods = methodAmounts(type === 'outstanding' ? billPayments : inRange)
      const paidAll = methodAmounts(billPayments).paid
      const settledAt = (inRange.at(-1) || billPayments.at(-1) || {}).paid_at || (inRange.at(-1) || billPayments.at(-1) || {}).created_at || bill.updated_at || bill.created_at
      const remaining = moneyRound(Math.max(0, (Number(bill.grand_total) || 0) - paidAll))
      const sessionOrders = lookups.ordersBySession.get(bill.session_id) || []
      return {
        id: bill.id,
        billId: bill.id,
        orderIds: sessionOrders.map((order) => order.id),
        at: settledAt || bill.created_at,
        createdAt: bill.created_at,
        settledAt,
        billNo: bill.bill_number || '',
        status: billStatusLabel(bill.status),
        billStatus: bill.status,
        gross: moneyRound(bill.subtotal),
        discount: moneyRound(bill.discount_amount),
        net: moneyRound(bill.grand_total),
        paid: methods.paid,
        outstanding: remaining,
        cash: methods.cash,
        upi: methods.upi,
        card: methods.card,
        qty: 0,
        paymentCount: (type === 'outstanding' ? billPayments : inRange).length,
        payments: type === 'outstanding' ? billPayments : inRange,
        ...factBase(meta),
      }
    })

  if (type === 'outstanding') {
    return billFacts.filter((row) => row.billStatus === 'open' || row.billStatus === 'payment_pending')
  }
  if (type === 'discounts') {
    return billFacts.filter((row) => row.discount > 0 && row.paymentCount > 0)
  }
  if (type === 'collections' || type === 'waiters' || type === 'tables') {
    return billFacts.filter((row) => row.paymentCount > 0)
  }
  return billFacts
}

export function filterFacts(facts, config = {}, params = {}) {
  const filters = { ...emptyAnalyticsFilters(), ...(config.filters || {}) }
  const search = config.search || params.search || ''
  return (facts || []).filter((fact) => {
    if (filters.waiterId && fact.waiterId !== filters.waiterId) return false
    if (filters.tableId && fact.tableId !== filters.tableId && !(fact.tableIds || []).includes(filters.tableId)) return false
    if (filters.method) {
      if (fact.method) {
        if (fact.method !== filters.method) return false
      } else if (!(Number(fact[filters.method]) > 0)) return false
    }
    if (filters.billStatus && fact.billStatus !== filters.billStatus) return false
    if (filters.orderStatus && fact.orderStatus !== filters.orderStatus) return false
    if (filters.kotStatus && fact.kotStatus !== filters.kotStatus) return false
    if (filters.kotType && fact.kotType !== filters.kotType) return false
    if (filters.categoryId && fact.categoryId !== filters.categoryId) return false
    if (filters.itemId && fact.itemId !== filters.itemId) return false
    if (filters.session) {
      const needle = String(filters.session).trim().toLowerCase()
      if (!String(fact.session || '').toLowerCase().includes(needle) && !String(fact.sessionId || '').includes(needle)) return false
    }
    if (filters.discount === 'yes' && !(Number(fact.discount) > 0)) return false
    if (filters.discount === 'no' && Number(fact.discount) > 0) return false
    if (filters.merged === 'yes' && !fact.merged) return false
    if (filters.merged === 'no' && fact.merged) return false
    return matchesSearch([fact.billNo, fact.session, fact.table, fact.waiter, fact.orderNo, fact.kotNo, fact.item, fact.reference], search)
  })
}

export function groupKeyParts(fact, groupId, offsetMinutes) {
  if (groupId === 'day') {
    const key = localDayKeyFromInstant(fact.at, offsetMinutes)
    return { key, label: formatDayLabel(key) }
  }
  if (groupId === 'month') {
    const key = localMonthKeyFromInstant(fact.at, offsetMinutes)
    return { key, label: formatMonthLabel(key) }
  }
  if (groupId === 'hour') {
    const hour = localHour(fact.at, offsetMinutes)
    return { key: String(hour), label: hourLabel(hour) }
  }
  if (groupId === 'waiter') return { key: fact.waiterId || 'unassigned', label: fact.waiter || 'Unassigned' }
  if (groupId === 'table') return { key: fact.tableId || 'none', label: fact.table || 'Table' }
  if (groupId === 'session') return { key: fact.sessionId || 'none', label: fact.session || 'Session' }
  if (groupId === 'method') return { key: fact.method || 'mixed', label: fact.method ? paymentMethodLabel(fact.method) : 'Mixed' }
  if (groupId === 'billStatus') return { key: fact.billStatus || 'unknown', label: fact.status || billStatusLabel(fact.billStatus) }
  if (groupId === 'orderStatus') return { key: fact.orderStatus || 'unknown', label: fact.orderStatus || '—' }
  if (groupId === 'kotStatus') return { key: fact.kotStatus || 'unknown', label: fact.kotStatus || '—' }
  if (groupId === 'kotType') return { key: fact.kotType || 'unknown', label: fact.kotType || '—' }
  if (groupId === 'category') return { key: fact.categoryId || fact.category || 'none', label: fact.category || 'Uncategorised' }
  if (groupId === 'item') return { key: fact.itemId || fact.item || 'none', label: fact.item || 'Item' }
  if (groupId === 'merged') return { key: fact.merged ? 'yes' : 'no', label: fact.merged ? 'Merged' : 'Single table' }
  return { key: 'all', label: 'All' }
}

export function groupFacts(facts, groups, offsetMinutes) {
  const keys = (groups || []).filter(Boolean)
  if (!keys.length) {
    const bag = emptyBag()
    for (const fact of facts) addBag(bag, fact)
    return [{ id: 'all', labels: { all: 'All' }, measures: finalizeBag(bag), count: facts.length }]
  }
  const map = new Map()
  for (const fact of facts) {
    const parts = keys.map((groupId) => groupKeyParts(fact, groupId, offsetMinutes))
    const id = parts.map((part) => part.key).join('|')
    let row = map.get(id)
    if (!row) {
      row = {
        id,
        keys: Object.fromEntries(keys.map((groupId, index) => [groupId, parts[index].key])),
        labels: Object.fromEntries(keys.map((groupId, index) => [groupId, parts[index].label])),
        bag: emptyBag(),
        count: 0,
      }
      map.set(id, row)
    }
    addBag(row.bag, fact)
    row.count += 1
  }
  return [...map.values()].map((row) => ({
    id: row.id,
    keys: row.keys,
    labels: row.labels,
    measures: finalizeBag(row.bag),
    count: row.count,
  }))
}

export function pivotFacts(facts, rowGroups, colGroup, measureId, offsetMinutes) {
  const rows = groupFacts(facts, rowGroups, offsetMinutes)
  const colKeys = []
  const colSeen = new Set()
  const cells = new Map()
  for (const fact of facts) {
    const rowParts = (rowGroups || []).map((groupId) => groupKeyParts(fact, groupId, offsetMinutes).key)
    const rowId = rowParts.join('|') || 'all'
    const col = colGroup ? groupKeyParts(fact, colGroup, offsetMinutes) : { key: 'all', label: 'All' }
    if (!colSeen.has(col.key)) {
      colSeen.add(col.key)
      colKeys.push(col)
    }
    const cellId = `${rowId}::${col.key}`
    let bag = cells.get(cellId)
    if (!bag) {
      bag = emptyBag()
      cells.set(cellId, bag)
    }
    addBag(bag, fact)
  }
  const measure = MEASURE_IDS.includes(measureId) ? measureId : 'paid'
  const matrix = rows.map((row) => {
    const values = {}
    let total = 0
    for (const col of colKeys) {
      const bag = cells.get(`${row.id}::${col.key}`)
      const measures = bag ? finalizeBag(bag) : finalizeBag(emptyBag())
      values[col.key] = measures[measure] || 0
      total = moneyRound(total + (values[col.key] || 0))
    }
    return { id: row.id, labels: row.labels, values, total, measures: row.measures }
  })
  return { columns: colKeys, rows: matrix, measure }
}

function compareValues(a, b, dir) {
  const left = a == null ? '' : a
  const right = b == null ? '' : b
  const bothNum = typeof left === 'number' && typeof right === 'number'
  const cmp = bothNum ? left - right : String(left).localeCompare(String(right), 'en-IN', { numeric: true, sensitivity: 'base' })
  return dir === 'asc' ? cmp : -cmp
}

export function sortRows(rows, sort, valueOf) {
  const key = sort?.key
  if (!key) return rows
  const dir = sort.dir === 'asc' ? 'asc' : 'desc'
  return rows.slice().sort((a, b) => compareValues(valueOf(a, key), valueOf(b, key), dir))
}

export function formatMeasure(id, value) {
  if (MEASURE_KIND[id] === 'money') {
    return moneyRound(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return String(Math.round(Number(value) || 0))
}

export function formatMoneyPlain(value) {
  return moneyRound(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function cellText(columnId, row) {
  const def = COLUMN_DEFS[columnId]
  if (!def) return ''
  if (def.kind === 'datetime') return formatReportDateTime(row[columnId] || row.at)
  if (def.kind === 'money') return formatMoneyPlain(row[columnId])
  if (def.kind === 'count') return String(Math.round(Number(row[columnId]) || 0))
  return row[columnId] == null || row[columnId] === '' ? '—' : String(row[columnId])
}

export function detailRowValues(fact) {
  return {
    ...fact,
    settledAt: fact.settledAt,
    createdAt: fact.createdAt || fact.at,
    qty: fact.qty,
    paid: fact.paid,
    gross: fact.gross,
    discount: fact.discount,
    net: fact.net,
    outstanding: fact.outstanding,
    cash: fact.cash,
    upi: fact.upi,
    card: fact.card,
    paymentCount: fact.paymentCount,
    orderCount: fact.orderId ? 1 : 0,
    billCount: fact.billId ? 1 : 0,
  }
}

export function groupedRowValues(row, groups) {
  const values = { ...row.measures }
  for (const groupId of groups || []) values[groupId] = row.labels[groupId]
  values.label = (groups || []).map((groupId) => row.labels[groupId]).filter(Boolean).join(' · ') || 'All'
  return values
}

export function sanitizeConfig(config = {}) {
  const type = config.reportType || 'collections'
  const defaults = reportDefaults(type)
  const groupSet = new Set(allowedGroups(type).map((row) => row.id))
  const measureSet = new Set(allowedMeasures(type).map((row) => row.id))
  const columnSet = new Set(allowedColumns(type).map((row) => row.id))
  const groups = (config.groups || []).filter((id) => groupSet.has(id))
  const measures = (config.measures || defaults.measures).filter((id) => measureSet.has(id))
  const columns = (config.columns || defaults.columns.map((col) => col.id)).filter((id) => columnSet.has(id))
  return {
    ...config,
    reportType: type,
    filters: { ...emptyAnalyticsFilters(), ...(config.filters || {}) },
    groups,
    measures: measures.length ? measures : defaults.measures.slice(),
    columns: columns.length ? columns : defaults.columns.map((col) => col.id),
    view: config.view || defaults.view,
    pivotRows: (config.pivotRows || groups.slice(0, 1)).filter((id) => groupSet.has(id)),
    pivotCols: (config.pivotCols || []).filter((id) => groupSet.has(id)).slice(0, 1),
    pivotMeasure: measureSet.has(config.pivotMeasure) ? config.pivotMeasure : (measures[0] || defaults.measures[0]),
    sort: config.sort || { key: '', dir: 'desc' },
  }
}

export function runAnalytics(type, data, config, params = {}) {
  const clean = sanitizeConfig({ ...config, reportType: type })
  const facts = filterFacts(buildFacts(type, data, params), clean, params)
  const offset = params.tzOffsetMinutes || 0
  const grouped = groupFacts(facts, clean.groups, offset)
  const chartGroup = clean.groups[0] || reportDefaults(type).chart || 'day'
  const chartRows = groupFacts(facts, [chartGroup], offset)
    .map((row) => ({
      key: row.id,
      label: row.labels[chartGroup],
      amount: row.measures[clean.measures[0] || 'paid'] || 0,
      count: row.count,
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'en-IN', { numeric: true }))
  const pivot = pivotFacts(facts, clean.pivotRows.length ? clean.pivotRows : clean.groups.slice(0, 1), clean.pivotCols[0] || '', clean.pivotMeasure, offset)
  const totals = finalizeBag(facts.reduce((bag, fact) => addBag(bag, fact), emptyBag()))
  return { facts, grouped, chartRows, chartGroup, pivot, totals, config: clean }
}
