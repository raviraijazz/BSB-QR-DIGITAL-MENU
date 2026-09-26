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
  if (type === 'add_on') return 'ADD ON'
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

export function elapsedLabel(value) {
  if (!value) return ''
  const start = new Date(value).getTime()
  if (Number.isNaN(start)) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}
