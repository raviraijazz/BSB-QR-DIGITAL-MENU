export const PLATFORM_ADMIN_LOGIN = '/platform-admin/login'
export const PLATFORM_ADMIN_HOME = '/platform-admin'

// Only implemented routes use `to`. Everything else is marked planned and is
// rendered as a non-interactive item so we never ship fake working pages.
export const PLATFORM_NAV = [
  { type: 'link', to: PLATFORM_ADMIN_HOME, label: 'Dashboard', icon: 'overview', end: true },
  {
    type: 'group',
    label: 'Restaurants',
    items: [
      { to: '/platform-admin/restaurants', label: 'All Restaurants', icon: 'restaurant' },
      { label: 'Add Restaurant', icon: 'plus', planned: true },
      { label: 'Import Menu Items', icon: 'menu', planned: true },
      { label: 'Restaurant Settings', icon: 'settings', planned: true },
      { label: 'Subscription & Plans', icon: 'collections', planned: true },
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
    items: [{ label: 'Platform Reports', icon: 'reports', planned: true }],
  },
  {
    type: 'group',
    label: 'System Management',
    items: [
      { to: '/platform-admin/account', label: 'Account & Security', icon: 'settings' },
      { label: 'Global Settings', icon: 'settings', planned: true },
      { label: 'Integrations', icon: 'link', planned: true },
      { label: 'System Logs', icon: 'history', planned: true },
      { label: 'Support & Maintenance', icon: 'support', planned: true },
    ],
  },
]

export const STATUS_META = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  inactive: { label: 'Inactive', className: 'bg-stone-100 text-stone-600 border-stone-200' },
  suspended: { label: 'Suspended', className: 'bg-red-50 text-red-700 border-red-200' },
}

export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
]

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
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
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
