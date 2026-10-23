export const REPORT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'restaurants', label: 'Restaurant growth' },
  { id: 'orders', label: 'Orders & operations' },
  { id: 'payments', label: 'Restaurant sales' },
  { id: 'billing', label: 'Subscription billing' },
  { id: 'subscriptions', label: 'Subscriptions & expiry' },
]

export const ORDER_STATUSES = [
  { id: '', label: 'All order statuses' },
  { id: 'new', label: 'New' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'served', label: 'Served' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const SALES_PAYMENT_METHODS = [
  { id: '', label: 'All methods' },
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
]

export const EXPIRY_WINDOWS = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
]

export const REPORT_BUCKETS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

export function parseDateKey(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  return text
}

export function utcRangeFromDateKeys(fromKey, toKey) {
  const from = parseDateKey(fromKey)
  const to = parseDateKey(toKey)
  if (!from || !to) return { error: 'Choose a start date and end date', from: null, to: null, toExclusive: null }
  if (to < from) return { error: 'End date cannot be before the start date', from: null, to: null, toExclusive: null }
  const exclusive = new Date(`${to}T00:00:00.000Z`)
  exclusive.setUTCDate(exclusive.getUTCDate() + 1)
  return {
    error: '',
    from: `${from}T00:00:00.000Z`,
    to: `${to}T00:00:00.000Z`,
    toExclusive: exclusive.toISOString(),
    fromKey: from,
    toKey: to,
  }
}

export function chooseBucket(fromKey, toKey) {
  const range = utcRangeFromDateKeys(fromKey, toKey)
  if (range.error) return 'day'
  const from = new Date(range.from)
  const toExclusive = new Date(range.toExclusive)
  const days = Math.round((toExclusive.getTime() - from.getTime()) / 86400000)
  if (days <= 14) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

export function emptyKpis() {
  return {
    restaurants_total: 0,
    restaurants_created: 0,
    status: { active: 0, frozen: 0, blocked: 0, expired: 0, other: 0 },
    unassigned_plan: 0,
    expiring: { d7: 0, d30: 0, d90: 0 },
    orders: 0,
    orders_cancelled: 0,
    gmv: 0,
    gmv_by_method: { cash: 0, upi: 0, card: 0 },
    bills: 0,
    average_bill: null,
    outstanding_bills: 0,
  }
}

export function emptyReport() {
  return {
    kpis: emptyKpis(),
    series: { signups: [], orders: [], gmv: [], assignments: [] },
    orders_by_status: [],
    top_restaurants: [],
    plan_mix: [],
    expiring: [],
    assignments: [],
    billing: { available: false, dependency: 'supabase/subscription-billing.sql' },
  }
}

export function countByStatus(statusMap, id) {
  const row = statusMap || {}
  const value = Number(row[id] || 0)
  return Number.isFinite(value) ? value : 0
}

export function operationalOrderCount(kpis, includeCancelled = false) {
  const total = Number(kpis?.orders || 0)
  const cancelled = Number(kpis?.orders_cancelled || 0)
  if (includeCancelled) return total
  return Math.max(0, total - cancelled)
}

export function collectedFromPaymentRows(rows) {
  let collected = 0
  for (const row of rows || []) {
    const amount = Number(row.amount_inr ?? row.amount ?? 0)
    if (!Number.isFinite(amount)) continue
    collected += row.kind === 'refund' ? -amount : amount
  }
  return Math.round(collected * 100) / 100
}

export function isValidityRenewal(assignment) {
  return Boolean(assignment?.change_validity)
}

export function planSwitchIsNotRenewal(assignment) {
  return Boolean(assignment?.plan_id) && !assignment?.change_validity
}

export function seriesToChart(rows, valueKey = 'value') {
  return (rows || []).map((row, index) => ({
    key: row.bucket || row.key || String(index),
    label: row.label || String(row.bucket || '').slice(0, 10),
    amount: Number(row[valueKey] ?? row.amount ?? 0) || 0,
    count: Number(row.count ?? row[valueKey] ?? 0) || 0,
  }))
}

export function billingUnavailable(billing) {
  return !billing || billing.available === false
}

export function normalizeReport(payload) {
  const base = emptyReport()
  if (!payload || typeof payload !== 'object') return base
  return {
    ...base,
    ...payload,
    kpis: { ...base.kpis, ...(payload.kpis || {}) },
    series: { ...base.series, ...(payload.series || {}) },
    billing: payload.billing && typeof payload.billing === 'object' ? payload.billing : base.billing,
  }
}

export function restaurantCsvColumns() {
  return [
    { label: 'Restaurant', key: 'name' },
    { label: 'Restaurant ID', key: 'id' },
    { label: 'Registered', value: (row) => String(row.created_at || '').slice(0, 10) },
    { label: 'Access status', key: 'status' },
    { label: 'Plan', value: (row) => row.plan_name || 'Unassigned' },
    { label: 'Valid until', value: (row) => (row.valid_until ? String(row.valid_until).slice(0, 10) : 'No expiry') },
    { label: 'Orders in period', key: 'order_count' },
    { label: 'Customer collections (INR)', key: 'gmv' },
  ]
}

export function orderStatusCsvColumns() {
  return [
    { label: 'Order status', key: 'status' },
    { label: 'Orders', key: 'count' },
  ]
}

export function salesCsvColumns() {
  return [
    { label: 'Restaurant', key: 'name' },
    { label: 'Restaurant ID', key: 'id' },
    { label: 'Cash (INR)', key: 'cash' },
    { label: 'UPI (INR)', key: 'upi' },
    { label: 'Card (INR)', key: 'card' },
    { label: 'Collected (INR)', key: 'gmv' },
  ]
}

export function billingCsvColumns() {
  return [
    { label: 'Invoice', key: 'invoice_number' },
    { label: 'Restaurant', key: 'restaurant_name' },
    { label: 'Invoice date', value: (row) => String(row.invoice_date || '').slice(0, 10) },
    { label: 'Due date', value: (row) => String(row.due_date || '').slice(0, 10) },
    { label: 'Amount (INR)', key: 'amount_inr' },
    { label: 'Paid (INR)', key: 'paid_amount_inr' },
    { label: 'Balance (INR)', key: 'balance_inr' },
    { label: 'Status', key: 'status' },
  ]
}

export function expiryCsvColumns() {
  return [
    { label: 'Restaurant', key: 'name' },
    { label: 'Restaurant ID', key: 'id' },
    { label: 'Access status', key: 'status' },
    { label: 'Plan', value: (row) => row.plan_name || 'Unassigned' },
    { label: 'Valid until', value: (row) => (row.valid_until ? String(row.valid_until).slice(0, 10) : 'No expiry') },
    { label: 'Days remaining', key: 'remaining_days' },
  ]
}

export function reportFilename(prefix, fromKey, toKey) {
  return `${prefix}-${fromKey || 'from'}-to-${toKey || 'to'}.csv`
}

export function gmvNeverIncludesSubscription(gmv, subscriptionCollected) {
  return Number(gmv || 0) !== Number(subscriptionCollected || 0) || Number(gmv || 0) === 0
}
