export const ORDER_TYPES = [
  { id: 'dine_in', label: 'Dine-in' },
  { id: 'takeaway', label: 'Takeaway' },
  { id: 'delivery', label: 'Delivery' },
]

export const PRINT_STATUSES = ['queued', 'printing', 'printed', 'failed', 'cancelled']

export function emptyPrinter() {
  return {
    name: 'Kitchen printer',
    printer_type: 'thermal',
    connection_type: 'browser',
    paper_width: '80mm',
    is_active: true,
    is_default_kot: false,
    is_default_bill: false,
    is_default_receipt: false,
    is_default_kitchen: false,
    use_for: 'kot',
    address: '',
    host: '',
    port: '',
    route_by: 'none',
    route_value: '',
  }
}

export function emptyRoute() {
  return {
    route_type: 'category',
    route_value: '',
    printer_id: '',
  }
}

export function normalizePrinters(rows) {
  return (rows || []).map((row) => {
    const useFor = ['kot', 'bill', 'receipt', 'kitchen'].includes(row.use_for)
      ? row.use_for
      : row.is_default_bill
        ? 'bill'
        : row.is_default_receipt
          ? 'receipt'
          : 'kot'
    return {
      ...emptyPrinter(),
      ...row,
      name: String(row.name || 'Printer').trim() || 'Printer',
      printer_type: ['thermal', 'kitchen', 'laser'].includes(row.printer_type) ? row.printer_type : 'thermal',
      connection_type: ['usb', 'network', 'bluetooth', 'browser', 'system'].includes(row.connection_type)
        ? row.connection_type
        : 'browser',
      paper_width: ['58mm', '80mm', 'a4'].includes(row.paper_width) ? row.paper_width : '80mm',
      is_active: row.is_active !== false,
      is_default_kot: Boolean(row.is_default_kot),
      is_default_bill: Boolean(row.is_default_bill),
      is_default_receipt: Boolean(row.is_default_receipt),
      is_default_kitchen: Boolean(row.is_default_kitchen),
      use_for: useFor,
      address: String(row.address || ''),
      host: String(row.host || ''),
      port: String(row.port || ''),
      route_by: row.route_by || 'none',
      route_value: String(row.route_value || ''),
    }
  })
}

export function normalizeRoutes(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    printer_id: row.printer_id || '',
    route_type: ['item', 'category', 'order_type'].includes(row.route_type) ? row.route_type : 'category',
    route_value: String(row.route_value || ''),
  }))
}

export function isKotPrinter(printer) {
  if (!printer || printer.is_active === false) return false
  if (printer.use_for === 'bill' || printer.use_for === 'receipt') return false
  return printer.use_for === 'kot' || printer.use_for === 'kitchen' || printer.is_default_kot || printer.is_default_kitchen
}

export function activeKotPrinters(printers) {
  return (printers || []).filter(isKotPrinter)
}

export function defaultKotPrinter(printers) {
  const rows = activeKotPrinters(printers)
  return rows.find((row) => row.is_default_kot) || rows.find((row) => row.is_default_kitchen) || rows[0] || null
}

export function isBillPrinter(printer) {
  if (!printer || printer.is_active === false) return false
  return printer.use_for === 'bill' || printer.is_default_bill
}

export function isReceiptPrinter(printer) {
  if (!printer || printer.is_active === false) return false
  return printer.use_for === 'receipt' || printer.is_default_receipt
}

export function activeBillPrinters(printers) {
  return (printers || []).filter((row) => isBillPrinter(row) || isReceiptPrinter(row))
}

export function defaultBillPrinter(printers) {
  const rows = (printers || []).filter((row) => row && row.is_active !== false)
  return rows.find((row) => row.is_default_bill && isBillPrinter(row))
    || rows.find(isBillPrinter)
    || rows.find((row) => row.is_default_receipt)
    || rows.find(isReceiptPrinter)
    || null
}

export function defaultReceiptPrinter(printers) {
  const rows = (printers || []).filter((row) => row && row.is_active !== false)
  return rows.find((row) => row.is_default_receipt && isReceiptPrinter(row))
    || rows.find(isReceiptPrinter)
    || defaultBillPrinter(printers)
}

export function backupBillPrinter(printers, primary) {
  const rows = activeBillPrinters(printers)
  return rows.find((row) => row.id && row.id !== primary?.id) || null
}

export function printerLabel(printer) {
  if (!printer) return 'Printer'
  return printer.name || 'Printer'
}

export function connectionLabel(value) {
  if (value === 'browser') return 'Browser print'
  if (value === 'system') return 'System print'
  if (value === 'usb') return 'USB'
  if (value === 'network') return 'Network'
  if (value === 'bluetooth') return 'Bluetooth'
  return value || 'Browser print'
}

export function printStatusLabel(status, printedAt) {
  if (status === 'printed' || printedAt) return 'Printed'
  if (status === 'failed') return 'Print failed'
  if (status === 'printing') return 'Printing'
  if (status === 'queued') return 'Queued'
  if (status === 'cancelled') return 'Cancelled'
  return 'Not printed'
}

export function orderTypeLabel(value) {
  return (ORDER_TYPES.find((row) => row.id === value) || ORDER_TYPES[0]).label
}

export function resolveOrderType(order, settings) {
  const fromOrder = String(order?.order_type || '').trim()
  if (['dine_in', 'takeaway', 'delivery'].includes(fromOrder)) return fromOrder
  const fromSettings = String(settings?.orders?.defaultOrderType || settings?.defaultOrderType || '').trim()
  if (['dine_in', 'takeaway', 'delivery'].includes(fromSettings)) return fromSettings
  return 'dine_in'
}

export function kotItemsWithMenu(kot, order) {
  const byId = Object.fromEntries((order?.order_items || []).map((item) => [item.id, item]))
  return (kot?.kot_items || []).map((item) => {
    const line = byId[item.order_item_id] || {}
    return {
      ...item,
      menu_item_id: item.menu_item_id || line.menu_item_id || null,
      item_name: item.item_name || line.item_name || 'Item',
      quantity: item.quantity ?? line.quantity ?? 1,
      notes: item.notes || line.notes || '',
      variant_name: item.variant_name || line.variant_name || '',
      item_code: item.item_code || line.item_code || '',
    }
  })
}

function printerById(printers, id) {
  if (!id) return null
  return (printers || []).find((row) => row.id === id && isKotPrinter(row)) || null
}

export function routeKotItems({ items, printers, routes, menuById, orderType }) {
  const fallback = defaultKotPrinter(printers)
  const itemRoutes = (routes || []).filter((row) => row.route_type === 'item')
  const categoryRoutes = (routes || []).filter((row) => row.route_type === 'category')
  const typeRoutes = (routes || []).filter((row) => row.route_type === 'order_type')
  const groups = new Map()

  function add(printer, item) {
    if (!printer) return
    const key = printer.id || printer.name
    if (!groups.has(key)) groups.set(key, { printer, items: [] })
    groups.get(key).items.push(item)
  }

  for (const item of items || []) {
    const menu = (menuById && item.menu_item_id) ? menuById[item.menu_item_id] : null
    let printer = null
    const itemRule = itemRoutes.find((row) => row.route_value && row.route_value === item.menu_item_id)
    if (itemRule) printer = printerById(printers, itemRule.printer_id)
    if (!printer && menu?.category_id) {
      const categoryRule = categoryRoutes.find((row) => row.route_value === menu.category_id)
      if (categoryRule) printer = printerById(printers, categoryRule.printer_id)
    }
    if (!printer && orderType) {
      const typeRule = typeRoutes.find((row) => row.route_value === orderType)
      if (typeRule) printer = printerById(printers, typeRule.printer_id)
    }
    add(printer || fallback, item)
  }

  return [...groups.values()]
}
