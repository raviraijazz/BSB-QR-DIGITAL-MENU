import { formatPrice, menuVariantRows } from './pricing'

export const OPEN_SESSION_STATUSES = ['active', 'bill_requested', 'payment_pending']

export function isOpenSession(session) {
  return Boolean(session && OPEN_SESSION_STATUSES.includes(session.status))
}

export function itemIsSoldOut(item) {
  return item?.is_available === false
}

export function orderableVariants(item) {
  if (itemIsSoldOut(item)) return []
  return menuVariantRows(item).filter((row) => row.is_available !== false)
}

export function cartLineKey(menuItemId, variantName) {
  return `${menuItemId}::${String(variantName || '')}`
}

export function lineAmount(unitPrice, quantity) {
  const price = Number(unitPrice) || 0
  const qty = Number(quantity) || 0
  return Math.round(price * qty * 100) / 100
}

export function cartTotals(lines) {
  const items = (lines || []).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
  const subtotal = (lines || []).reduce((sum, line) => sum + lineAmount(line.unit_price, line.quantity), 0)
  return { items, subtotal }
}

export function formatMoney(value) {
  return formatPrice(value)
}

export function moneyRound(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function formatBillMoney(value) {
  return `₹${moneyRound(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function billStatusLabel(status) {
  const value = String(status || 'open')
  if (value === 'payment_pending') return 'Payment pending'
  if (value === 'paid') return 'Settled'
  if (value === 'cancelled') return 'Void'
  return 'Open'
}

export function applyBillDiscount(subtotal, discountType, discountValue) {
  const sub = moneyRound(subtotal)
  const type = discountType === 'percent' || discountType === 'amount' ? discountType : null
  let value = moneyRound(discountValue)
  if (value < 0) value = 0
  let warning = ''
  if (!type || value === 0) {
    return {
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      taxable: sub,
      payable: sub,
      warning: '',
    }
  }
  let amount = 0
  if (type === 'percent') {
    if (value > 100) {
      warning = 'Percentage cannot exceed 100.'
      value = 100
    }
    amount = moneyRound((sub * value) / 100)
  } else if (value > sub) {
    warning = 'Discount cannot exceed subtotal.'
    value = sub
    amount = sub
  } else {
    amount = value
  }
  if (amount > sub) amount = sub
  const payable = moneyRound(Math.max(0, sub - amount))
  return {
    discountType: type,
    discountValue: value,
    discountAmount: moneyRound(amount),
    taxable: payable,
    payable,
    warning,
  }
}

export function sessionOrderTotals(orders) {
  let subtotal = 0
  let itemCount = 0
  let orderCount = 0
  for (const order of orders || []) {
    if (order.status === 'cancelled') continue
    orderCount += 1
    for (const item of order.order_items || []) {
      subtotal += Number(item.line_total) || 0
      itemCount += Number(item.quantity) || 0
    }
  }
  return { subtotal: moneyRound(subtotal), itemCount, orderCount }
}

export function orderStatusLabel(status) {
  const value = String(status || 'new')
  if (value === 'new') return 'New'
  if (value === 'accepted') return 'Accepted'
  if (value === 'preparing') return 'Preparing'
  if (value === 'ready') return 'Ready'
  if (value === 'served') return 'Served'
  if (value === 'cancelled') return 'Cancelled'
  return value
}

export function formatClock(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export function kotTypeLabel(value) {
  const type = String(value || 'new')
  if (type === 'add_on') return 'ADD-ON'
  if (type === 'modification') return 'MODIFICATION'
  if (type === 'cancellation') return 'CANCELLATION'
  if (type === 'transfer') return 'TRANSFER'
  return 'NEW'
}

export function kotStatusLabel(value) {
  const status = String(value || 'new')
  if (status === 'preparing') return 'Preparing'
  if (status === 'ready') return 'Ready'
  if (status === 'served') return 'Served'
  if (status === 'cancelled') return 'Cancelled'
  return 'New'
}

export function formatQty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return n % 1 === 0 ? String(n) : String(n)
}

export function firstRelated(value) {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

export function elapsedMinutes(value, now = Date.now()) {
  if (!value) return 0
  const start = new Date(value).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 60000))
}

export function elapsedLabel(value, now = Date.now()) {
  if (!value) return ''
  const minutes = elapsedMinutes(value, now)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function kotAgeTone(minutes, status) {
  if (status === 'ready') return 'ready'
  if (minutes >= 15) return 'delayed'
  if (minutes >= 5) return 'waiting'
  return 'fresh'
}
