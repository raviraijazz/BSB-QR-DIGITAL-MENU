export const REPORT_TYPES = [
  { id: 'collections', label: 'Collections', hint: 'Settled payments and cash-up' },
  { id: 'sales', label: 'Sales / Orders', hint: 'Orders placed in the period' },
  { id: 'payments', label: 'Payments', hint: 'Each Cash, UPI and Card record' },
  { id: 'waiters', label: 'Waiter Performance', hint: 'Sales and collections by waiter' },
  { id: 'tables', label: 'Table / Sessions', hint: 'Session-level sales by table' },
  { id: 'items', label: 'Items / Menu', hint: 'Item quantity and sales' },
  { id: 'discounts', label: 'Discounts', hint: 'Bills with a discount applied' },
  { id: 'kitchen', label: 'KOT / Kitchen', hint: 'Kitchen tickets by status and type' },
  { id: 'outstanding', label: 'Outstanding Bills', hint: 'Open and partially paid bills' },
]

export const GROUP_OPTIONS = [
  { id: 'day', label: 'Date' },
  { id: 'month', label: 'Month' },
  { id: 'hour', label: 'Hour' },
  { id: 'waiter', label: 'Waiter' },
  { id: 'table', label: 'Table' },
  { id: 'session', label: 'Session' },
  { id: 'method', label: 'Payment Method' },
  { id: 'billStatus', label: 'Bill Status' },
  { id: 'orderStatus', label: 'Order Status' },
  { id: 'kotStatus', label: 'KOT Status' },
  { id: 'kotType', label: 'Order Type' },
  { id: 'category', label: 'Menu Category' },
  { id: 'item', label: 'Menu Item' },
  { id: 'merged', label: 'Merged Tables' },
]

export const MEASURES = [
  { id: 'gross', label: 'Gross Sales', kind: 'money' },
  { id: 'discount', label: 'Discount', kind: 'money' },
  { id: 'net', label: 'Net Sales', kind: 'money' },
  { id: 'paid', label: 'Paid / Collected', kind: 'money' },
  { id: 'outstanding', label: 'Outstanding', kind: 'money' },
  { id: 'cash', label: 'Cash', kind: 'money' },
  { id: 'upi', label: 'UPI', kind: 'money' },
  { id: 'card', label: 'Card', kind: 'money' },
  { id: 'billCount', label: 'Bill Count', kind: 'count' },
  { id: 'orderCount', label: 'Order Count', kind: 'count' },
  { id: 'paymentCount', label: 'Payment Count', kind: 'count' },
  { id: 'itemQty', label: 'Item Quantity', kind: 'count' },
  { id: 'aov', label: 'Average Order Value', kind: 'money' },
  { id: 'abv', label: 'Average Bill Value', kind: 'money' },
]

export const COLUMN_DEFS = {
  settledAt: { id: 'settledAt', label: 'Settlement Date', kind: 'datetime' },
  createdAt: { id: 'createdAt', label: 'Date / Time', kind: 'datetime' },
  billNo: { id: 'billNo', label: 'Bill No.', kind: 'text' },
  session: { id: 'session', label: 'Session', kind: 'text' },
  table: { id: 'table', label: 'Table', kind: 'text' },
  waiter: { id: 'waiter', label: 'Waiter', kind: 'text' },
  orderNo: { id: 'orderNo', label: 'Order No.', kind: 'text' },
  kotNo: { id: 'kotNo', label: 'KOT No.', kind: 'text' },
  item: { id: 'item', label: 'Item', kind: 'text' },
  category: { id: 'category', label: 'Category', kind: 'text' },
  method: { id: 'method', label: 'Method', kind: 'text' },
  reference: { id: 'reference', label: 'Reference', kind: 'text' },
  status: { id: 'status', label: 'Status', kind: 'text' },
  kotType: { id: 'kotType', label: 'Type', kind: 'text' },
  gross: { id: 'gross', label: 'Gross', kind: 'money' },
  discount: { id: 'discount', label: 'Discount', kind: 'money' },
  net: { id: 'net', label: 'Net', kind: 'money' },
  cash: { id: 'cash', label: 'Cash', kind: 'money' },
  upi: { id: 'upi', label: 'UPI', kind: 'money' },
  card: { id: 'card', label: 'Card', kind: 'money' },
  paid: { id: 'paid', label: 'Paid', kind: 'money' },
  outstanding: { id: 'outstanding', label: 'Outstanding', kind: 'money' },
  qty: { id: 'qty', label: 'Qty', kind: 'count' },
  paymentCount: { id: 'paymentCount', label: 'Payments', kind: 'count' },
  orderCount: { id: 'orderCount', label: 'Orders', kind: 'count' },
  billCount: { id: 'billCount', label: 'Bills', kind: 'count' },
}

const COL = (ids) => ids.map((id) => COLUMN_DEFS[id]).filter(Boolean)

export const REPORT_DEFAULTS = {
  collections: {
    groups: [],
    measures: ['paid', 'cash', 'upi', 'card', 'billCount'],
    columns: COL(['settledAt', 'billNo', 'session', 'table', 'waiter', 'gross', 'discount', 'net', 'cash', 'upi', 'card', 'paid', 'status']),
    groupsAllowed: ['day', 'month', 'waiter', 'table', 'method', 'billStatus', 'merged'],
    measuresAllowed: ['gross', 'discount', 'net', 'paid', 'cash', 'upi', 'card', 'billCount', 'paymentCount', 'abv'],
    chart: 'method',
    view: 'overview',
  },
  sales: {
    groups: [],
    measures: ['gross', 'orderCount', 'aov'],
    columns: COL(['createdAt', 'orderNo', 'session', 'table', 'waiter', 'gross', 'status']),
    groupsAllowed: ['day', 'month', 'hour', 'waiter', 'table', 'orderStatus', 'session'],
    measuresAllowed: ['gross', 'orderCount', 'itemQty', 'aov'],
    chart: 'day',
    view: 'list',
  },
  payments: {
    groups: [],
    measures: ['paid', 'paymentCount'],
    columns: COL(['createdAt', 'billNo', 'session', 'table', 'waiter', 'method', 'paid', 'reference', 'status']),
    groupsAllowed: ['day', 'month', 'hour', 'method', 'waiter', 'table'],
    measuresAllowed: ['paid', 'cash', 'upi', 'card', 'paymentCount'],
    chart: 'method',
    view: 'list',
  },
  waiters: {
    groups: ['waiter'],
    measures: ['gross', 'paid', 'orderCount', 'billCount'],
    columns: COL(['waiter', 'billCount', 'orderCount', 'gross', 'discount', 'net', 'paid']),
    groupsAllowed: ['waiter', 'day', 'month', 'table'],
    measuresAllowed: ['gross', 'discount', 'net', 'paid', 'orderCount', 'billCount', 'aov'],
    chart: 'waiter',
    view: 'list',
  },
  tables: {
    groups: ['table'],
    measures: ['gross', 'paid', 'billCount'],
    columns: COL(['table', 'session', 'waiter', 'billCount', 'orderCount', 'gross', 'discount', 'net', 'paid']),
    groupsAllowed: ['table', 'day', 'month', 'waiter', 'merged'],
    measuresAllowed: ['gross', 'discount', 'net', 'paid', 'billCount', 'orderCount'],
    chart: 'table',
    view: 'list',
  },
  items: {
    groups: ['item'],
    measures: ['itemQty', 'gross'],
    columns: COL(['item', 'category', 'qty', 'gross', 'orderCount']),
    groupsAllowed: ['item', 'category', 'day', 'month', 'waiter'],
    measuresAllowed: ['itemQty', 'gross', 'orderCount'],
    chart: 'item',
    view: 'list',
  },
  discounts: {
    groups: [],
    measures: ['discount', 'gross', 'net', 'billCount'],
    columns: COL(['settledAt', 'billNo', 'session', 'table', 'waiter', 'gross', 'discount', 'net', 'status']),
    groupsAllowed: ['day', 'month', 'waiter', 'table'],
    measuresAllowed: ['gross', 'discount', 'net', 'billCount'],
    chart: 'day',
    view: 'list',
  },
  kitchen: {
    groups: [],
    measures: ['orderCount', 'itemQty'],
    columns: COL(['createdAt', 'kotNo', 'orderNo', 'table', 'waiter', 'kotType', 'status', 'qty']),
    groupsAllowed: ['day', 'hour', 'kotStatus', 'kotType', 'waiter', 'table'],
    measuresAllowed: ['orderCount', 'itemQty'],
    chart: 'status',
    view: 'list',
  },
  outstanding: {
    groups: [],
    measures: ['outstanding', 'paid', 'net', 'billCount'],
    columns: COL(['createdAt', 'billNo', 'session', 'table', 'waiter', 'net', 'paid', 'outstanding', 'status']),
    groupsAllowed: ['waiter', 'table', 'billStatus', 'day'],
    measuresAllowed: ['net', 'paid', 'outstanding', 'billCount'],
    chart: 'waiter',
    view: 'list',
  },
}

export function reportMeta(type) {
  return REPORT_TYPES.find((row) => row.id === type) || REPORT_TYPES[0]
}

export function reportDefaults(type) {
  return REPORT_DEFAULTS[type] || REPORT_DEFAULTS.collections
}

export function emptyAnalyticsFilters() {
  return {
    waiterId: '',
    tableId: '',
    method: '',
    billStatus: '',
    orderStatus: '',
    kotStatus: '',
    kotType: '',
    categoryId: '',
    itemId: '',
    session: '',
    discount: '',
    merged: '',
  }
}

export function defaultConfig(type = 'collections') {
  const defaults = reportDefaults(type)
  return {
    reportType: type,
    rangePreset: 'today',
    customFrom: '',
    customTo: '',
    search: '',
    filters: emptyAnalyticsFilters(),
    groups: defaults.groups.slice(),
    measures: defaults.measures.slice(),
    columns: defaults.columns.map((col) => col.id),
    sort: { key: '', dir: 'desc' },
    view: defaults.view,
    pivotRows: defaults.groups.slice(0, 1),
    pivotCols: type === 'payments' || type === 'collections' ? ['method'] : [],
    pivotMeasure: defaults.measures[0] || 'paid',
  }
}

export function allowedGroups(type) {
  const allowed = new Set(reportDefaults(type).groupsAllowed)
  return GROUP_OPTIONS.filter((row) => allowed.has(row.id))
}

export function allowedMeasures(type) {
  const allowed = new Set(reportDefaults(type).measuresAllowed)
  return MEASURES.filter((row) => allowed.has(row.id))
}

export function allowedColumns(type) {
  return reportDefaults(type).columns
}
