export const PLATFORM_ADMIN_LOGIN = '/platform-admin/login'
export const PLATFORM_ADMIN_HOME = '/platform-admin'
export const PLATFORM_ADMIN_RESTAURANTS = '/platform-admin/restaurants'
export const PLATFORM_ADMIN_IMPORT = '/platform-admin/import-menu'
export const PLATFORM_ADMIN_SUBSCRIPTIONS = '/platform-admin/subscriptions'
export const PLATFORM_ADMIN_BILLING = '/platform-admin/subscriptions/payments'
export const PLATFORM_ADMIN_AUDIT = '/platform-admin/audit'
export const PLATFORM_ADMIN_REPORTS = '/platform-admin/reports'
export const PLATFORM_ADMIN_ACCOUNT = '/platform-admin/account'
export const PLATFORM_ADMIN_SESSIONS = '/platform-admin/sessions'
export const PLATFORM_ADMIN_SETTINGS = '/platform-admin/settings'
export const PLATFORM_ADMIN_INTEGRATIONS = '/platform-admin/integrations'

// Only implemented routes use `to`. Everything else is a non-interactive
// "Soon" item so we never ship fake working pages.
export const PLATFORM_NAV = [
  { type: 'link', to: PLATFORM_ADMIN_HOME, label: 'Dashboard', icon: 'overview', end: true },
  {
    type: 'group',
    label: 'Restaurants',
    items: [
      { to: PLATFORM_ADMIN_RESTAURANTS, label: 'All Restaurants', icon: 'restaurant' },
      { to: PLATFORM_ADMIN_IMPORT, label: 'Import Menu', icon: 'menu' },
      { to: PLATFORM_ADMIN_AUDIT, label: 'Audit Trail', icon: 'history' },
      { label: 'Add Restaurant', icon: 'plus', planned: true },
      { to: PLATFORM_ADMIN_SUBSCRIPTIONS, label: 'Subscription & Plans', icon: 'collections' },
      { to: PLATFORM_ADMIN_BILLING, label: 'Payments & History', icon: 'orders' },
    ],
  },
  {
    type: 'group',
    label: 'Menu Management',
    items: [
      { label: 'Menus', icon: 'menu', planned: true },
      { label: 'Categories', icon: 'categories', planned: true },
      { label: 'Menu Items', icon: 'folder', planned: true },
    ],
  },
  { type: 'link', label: 'Orders & Operations', icon: 'orders', planned: true },
  { type: 'link', label: 'Users Management', icon: 'waiters', planned: true },
  {
    type: 'group',
    label: 'Reports & Analytics',
    items: [{ to: PLATFORM_ADMIN_REPORTS, label: 'Platform Reports', icon: 'reports' }],
  },
  {
    type: 'group',
    label: 'System Management',
    items: [
      { to: PLATFORM_ADMIN_ACCOUNT, label: 'Account & Security', icon: 'settings' },
      { to: PLATFORM_ADMIN_SESSIONS, label: 'Session Management', icon: 'history' },
      { to: PLATFORM_ADMIN_SETTINGS, label: 'Global Settings', icon: 'settings' },
      { to: PLATFORM_ADMIN_INTEGRATIONS, label: 'Integrations', icon: 'link' },
      { label: 'System Logs', icon: 'history', planned: true },
      { label: 'Support & Maintenance', icon: 'support', planned: true },
    ],
  },
]

export const STATUS_META = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  frozen: { label: 'Frozen', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  blocked: { label: 'Blocked', className: 'bg-red-50 text-red-700 border-red-200' },
  expired: { label: 'Expired', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'expired', label: 'Expired' },
]

export const VALIDITY_PRESETS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: '1 year' },
]

// Restaurants that may not start a normal support session.
export const RESTRICTED_STATUSES = ['frozen', 'blocked', 'expired']

export const RANGE_PRESETS = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
]

export function rangeFromDays(days) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400000)
  return { from, to }
}

export function toDateInput(date) {
  return date.toISOString().slice(0, 10)
}

export function formatMoney(value, currency = 'INR') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Not available'
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `₹${amount.toFixed(2)}`
  }
}

export function formatCount(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Not available'
  return new Intl.NumberFormat('en-IN').format(number)
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function remainingDaysLabel(days) {
  if (days == null) return 'No expiry'
  const value = Number(days)
  if (!Number.isFinite(value)) return '—'
  if (value <= 0) return 'Expired'
  if (value === 1) return '1 day left'
  return `${value} days left`
}
