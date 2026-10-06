export const PRIMARY_SECTIONS = [
  { id: 'profile', label: 'Restaurant Profile' },
  { id: 'branding', label: 'Branding' },
  { id: 'tax', label: 'Tax & Charges' },
  { id: 'payments', label: 'Payment Methods' },
  { id: 'kot', label: 'KOT Settings' },
  { id: 'bill', label: 'Bill / Receipt' },
  { id: 'printers', label: 'Printer Settings' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'qr', label: 'QR & Ordering' },
]

export const MORE_SECTIONS = [
  { id: 'orders', label: 'Orders & Service' },
  { id: 'floor', label: 'Floor & Tables' },
  { id: 'kitchen', label: 'Kitchen / KDS' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'waiters', label: 'Waiters' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'advanced', label: 'Advanced' },
]

export const ALL_SECTIONS = [...PRIMARY_SECTIONS, ...MORE_SECTIONS]

export const WEEKDAYS = [
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
  { id: 6, label: 'Saturday' },
  { id: 0, label: 'Sunday' },
]

export const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Kathmandu',
  'UTC',
]

export const CURRENCIES = [
  { id: 'INR', label: 'INR — Indian Rupee' },
  { id: 'USD', label: 'USD — US Dollar' },
  { id: 'AED', label: 'AED — UAE Dirham' },
  { id: 'NPR', label: 'NPR — Nepalese Rupee' },
]

export const RESTAURANT_TYPES = ['Casual Dining', 'Fine Dining', 'Cafe', 'QSR', 'Cloud Kitchen', 'Bar & Restaurant', 'Bakery']

export const PERMISSION_GROUPS = [
  { id: 'orders', label: 'Orders' },
  { id: 'kitchen', label: 'KOT / Kitchen' },
  { id: 'bills', label: 'Bills' },
  { id: 'payments', label: 'Payments' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'collections', label: 'Collections' },
  { id: 'tables', label: 'Tables' },
  { id: 'waiters', label: 'Waiters' },
  { id: 'menu', label: 'Menu' },
  { id: 'reports', label: 'Reports' },
  { id: 'printing', label: 'Printing' },
  { id: 'settings', label: 'Settings' },
]

export const ROLE_KEYS = [
  { id: 'owner', label: 'Owner' },
  { id: 'manager', label: 'Manager' },
  { id: 'waiter', label: 'Waiter' },
  { id: 'cashier', label: 'Cashier' },
  { id: 'kitchen', label: 'Kitchen' },
]

const OWNER_PERMS = Object.fromEntries(PERMISSION_GROUPS.map((row) => [row.id, true]))
const MANAGER_PERMS = { ...OWNER_PERMS, settings: false }
const WAITER_PERMS = {
  orders: true,
  kitchen: true,
  bills: true,
  payments: false,
  discounts: false,
  collections: false,
  tables: true,
  waiters: false,
  menu: false,
  reports: false,
  printing: false,
  settings: false,
}
const CASHIER_PERMS = {
  ...WAITER_PERMS,
  payments: true,
  discounts: true,
  collections: true,
  orders: true,
  tables: true,
  kitchen: false,
}
const KITCHEN_PERMS = {
  orders: true,
  kitchen: true,
  bills: false,
  payments: false,
  discounts: false,
  collections: false,
  tables: false,
  waiters: false,
  menu: false,
  reports: false,
  printing: false,
  settings: false,
}

function hoursRow(day) {
  return { day_of_week: day, is_open: true, open_time: '11:00', close_time: '23:00' }
}

export function defaultWorkingHours() {
  return WEEKDAYS.map((day) => hoursRow(day.id))
}

export function defaultPaymentMethods() {
  return [
    { method: 'cash', label: 'Cash', is_enabled: true, sort_order: 0, upi_id: '', display_name: '', reference_required: false },
    { method: 'upi', label: 'UPI', is_enabled: true, sort_order: 1, upi_id: '', display_name: '', reference_required: false },
    { method: 'card', label: 'Card', is_enabled: true, sort_order: 2, upi_id: '', display_name: '', reference_required: true },
  ]
}

export function defaultTaxRates() {
  return [{ name: 'GST', rate: 0, is_enabled: false, sort_order: 0 }]
}

export function defaultServiceCharges() {
  return [{ is_enabled: false, charge_type: 'percent', value: 0, is_taxable: false, sort_order: 0 }]
}

export function defaultRoles() {
  return [
    { role_key: 'owner', name: 'Owner', permissions: { ...OWNER_PERMS } },
    { role_key: 'manager', name: 'Manager', permissions: { ...MANAGER_PERMS } },
    { role_key: 'waiter', name: 'Waiter', permissions: { ...WAITER_PERMS } },
    { role_key: 'cashier', name: 'Cashier', permissions: { ...CASHIER_PERMS } },
    { role_key: 'kitchen', name: 'Kitchen', permissions: { ...KITCHEN_PERMS } },
  ]
}

export function defaultPrinters() {
  return []
}

export function defaultKot() {
  return {
    showRestaurantName: true,
    showLogo: false,
    showKotNumber: true,
    showTable: true,
    showWaiter: true,
    showOrderTime: true,
    showOrderType: true,
    showItemCode: false,
    showItemName: true,
    showVariant: true,
    showQuantity: true,
    showNotes: true,
    showCustomerName: false,
    showAddonLabel: true,
    showReprintLabel: true,
    header: '',
    footer: '',
    sound: true,
    timer: true,
    ageHighlight: true,
    addonDistinction: true,
  }
}

export function defaultBill() {
  return {
    showLogo: true,
    showRestaurantName: true,
    showLegalName: false,
    showAddress: true,
    showPhone: true,
    showEmail: false,
    showGstin: true,
    showBillNumber: true,
    showTable: true,
    showWaiter: true,
    showGuestCount: false,
    showItemCode: false,
    showItemName: true,
    showVariants: true,
    showDiscount: true,
    showTax: true,
    showServiceCharge: true,
    showPaymentMethod: true,
    showSplitPayments: true,
    showUpiInfo: true,
    showFooter: true,
    header: '',
    footer: '',
    thankYou: 'Thank you. Please visit again.',
    refundText: '',
  }
}

export function defaultQr() {
  return {
    guestMenuEnabled: true,
    qrEnabled: true,
    showPrices: true,
    showSoldOut: true,
    language: 'en',
    guestOrdering: false,
    tableQrBehavior: 'menu',
    brandedQr: true,
  }
}

export function defaultOrders() {
  return {
    dineIn: true,
    takeaway: false,
    delivery: false,
    defaultOrderType: 'dine_in',
    askGuestCount: false,
    allowOrderNotes: true,
    orderPrefix: '',
    allowCancel: true,
    addonBehavior: 'new_kot',
  }
}

export function defaultFloor() {
  return {
    defaultFloor: 'Main',
    defaultCapacity: 4,
    numbering: 'numeric',
    waiterAssignment: 'assigned',
    sessionBehavior: 'open_until_settled',
    showTableStatus: true,
  }
}

export function defaultKitchen() {
  return {
    enabled: true,
    sound: true,
    timer: true,
    ageHighlight: true,
    sort: 'oldest',
    addonDistinction: true,
    refreshSeconds: 8,
    stations: '',
  }
}

export function defaultDiscounts() {
  return {
    percentEnabled: true,
    fixedEnabled: true,
    maxPercent: 100,
    maxAmount: 0,
    allowedRoles: ['owner', 'manager'],
    approvalRequired: false,
    reasons: 'Complimentary, Staff, Festival, Other',
  }
}

export function defaultWaiterPrefs() {
  return {
    loginEnabled: true,
    sessionTimeoutMinutes: 480,
    minPasswordLength: 6,
    canCollectPayment: false,
    canDiscount: false,
    canCancelOrder: false,
    canTransferTable: false,
    restrictAssignedTables: true,
  }
}

export function defaultNotifications() {
  return {
    newOrder: true,
    newKot: true,
    kotReady: true,
    payment: true,
    failedOperation: true,
    ownerAlerts: true,
  }
}

export function defaultSecurity() {
  return {
    ownerTimeoutMinutes: 480,
    waiterTimeoutMinutes: 480,
    minPasswordLength: 6,
    confirmSensitive: true,
    auditLog: true,
  }
}

export function defaultAdvanced() {
  return {
    exportConfig: true,
    exportData: false,
    auditAccess: true,
    orderPrefix: '',
    billPrefix: '',
    kotPrefix: '',
    archiveDays: 365,
  }
}

export function emptySettings(restaurant = {}, user = {}) {
  return {
    name: restaurant.name || '',
    phone: restaurant.phone || '',
    address: restaurant.address || '',
    logo_url: restaurant.logo_url || '',
    restaurant_type: '',
    owner_name: user?.user_metadata?.username || '',
    email: '',
    alternate_phone: '',
    gstin: '',
    fssai: '',
    city: '',
    state: '',
    pin: '',
    timezone: restaurant.timezone || restaurant.time_zone || restaurant.tz || 'Asia/Kolkata',
    currency: 'INR',
    website: '',
    facebook: '',
    instagram: '',
    google_maps: '',
    tagline: '',
    thank_you_message: 'Thank you. Please visit again.',
    terms: '',
    primary_color: '#1f3d32',
    secondary_color: '#c4a574',
    mark_url: '',
    tax_enabled: false,
    tax_mode: 'exclusive',
    rounding: 'none',
    hours: defaultWorkingHours(),
    taxRates: defaultTaxRates(),
    serviceCharges: defaultServiceCharges(),
    payments: defaultPaymentMethods(),
    printers: defaultPrinters(),
    roles: defaultRoles(),
    kot: defaultKot(),
    bill: defaultBill(),
    qr: defaultQr(),
    orders: defaultOrders(),
    floor: defaultFloor(),
    kitchen: defaultKitchen(),
    discounts: defaultDiscounts(),
    waiters: defaultWaiterPrefs(),
    notifications: defaultNotifications(),
    security: defaultSecurity(),
    advanced: defaultAdvanced(),
  }
}

function mergeObject(base, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...base }
  return { ...base, ...value }
}

function timeValue(value, fallback) {
  const text = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback
}

export function normalizeHours(rows) {
  const byDay = Object.fromEntries((rows || []).map((row) => [Number(row.day_of_week), row]))
  return WEEKDAYS.map((day) => {
    const row = byDay[day.id]
    return {
      id: row?.id,
      day_of_week: day.id,
      is_open: row ? row.is_open !== false : true,
      open_time: timeValue(row?.open_time, '11:00'),
      close_time: timeValue(row?.close_time, '23:00'),
    }
  })
}

export function normalizePayments(rows) {
  const byMethod = Object.fromEntries((rows || []).map((row) => [row.method, row]))
  return defaultPaymentMethods().map((item) => {
    const row = byMethod[item.method]
    return {
      id: row?.id,
      method: item.method,
      label: row?.label || item.label,
      is_enabled: row ? row.is_enabled !== false : item.is_enabled,
      sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : item.sort_order,
      upi_id: row?.upi_id || '',
      display_name: row?.display_name || '',
      reference_required: row ? Boolean(row.reference_required) : item.reference_required,
    }
  })
}

export function normalizeRoles(rows, permissions) {
  const byKey = Object.fromEntries((rows || []).map((row) => [row.role_key, row]))
  const permsByRole = {}
  for (const row of permissions || []) {
    const role = (rows || []).find((item) => item.id === row.role_id)
    const key = role?.role_key
    if (!key) continue
    if (!permsByRole[key]) permsByRole[key] = {}
    permsByRole[key][row.permission_key] = Boolean(row.allowed)
  }
  return defaultRoles().map((item) => ({
    id: byKey[item.role_key]?.id,
    role_key: item.role_key,
    name: byKey[item.role_key]?.name || item.name,
    permissions: { ...item.permissions, ...(permsByRole[item.role_key] || {}) },
  }))
}

export function hydrateSettings(restaurant, payload, user) {
  const base = emptySettings(restaurant, user)
  const row = payload?.settings || {}
  return {
    ...base,
    name: restaurant?.name || base.name,
    phone: restaurant?.phone || base.phone,
    address: restaurant?.address || base.address,
    logo_url: restaurant?.logo_url || base.logo_url,
    restaurant_type: row.restaurant_type || '',
    owner_name: row.owner_name || base.owner_name,
    email: row.email || '',
    alternate_phone: row.alternate_phone || '',
    gstin: row.gstin || '',
    fssai: row.fssai || '',
    city: row.city || '',
    state: row.state || '',
    pin: row.pin || '',
    timezone: row.timezone || base.timezone,
    currency: row.currency || 'INR',
    website: row.website || '',
    facebook: row.facebook || '',
    instagram: row.instagram || '',
    google_maps: row.google_maps || '',
    tagline: row.tagline || '',
    thank_you_message: row.thank_you_message || base.thank_you_message,
    terms: row.terms || '',
    primary_color: row.primary_color || base.primary_color,
    secondary_color: row.secondary_color || base.secondary_color,
    mark_url: row.mark_url || '',
    tax_enabled: row.tax_enabled === true,
    tax_mode: row.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive',
    rounding: ['nearest', 'up', 'down'].includes(row.rounding) ? row.rounding : 'none',
    hours: normalizeHours(payload?.hours),
    taxRates: (payload?.taxRates || []).length ? payload.taxRates : defaultTaxRates(),
    serviceCharges: (payload?.serviceCharges || []).length ? payload.serviceCharges : defaultServiceCharges(),
    payments: normalizePayments(payload?.payments),
    printers: payload?.printers || [],
    roles: normalizeRoles(payload?.roles, payload?.permissions),
    kot: mergeObject(defaultKot(), row.kot),
    bill: mergeObject(defaultBill(), row.bill),
    qr: mergeObject(defaultQr(), row.qr),
    orders: mergeObject(defaultOrders(), row.orders),
    floor: mergeObject(defaultFloor(), row.floor),
    kitchen: mergeObject(defaultKitchen(), row.kitchen),
    discounts: mergeObject(defaultDiscounts(), row.discounts),
    waiters: mergeObject(defaultWaiterPrefs(), row.waiters),
    notifications: mergeObject(defaultNotifications(), row.notifications),
    security: mergeObject(defaultSecurity(), row.security),
    advanced: mergeObject(defaultAdvanced(), row.advanced),
  }
}

export function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value))
}

export function settingsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function isHttpUrl(value) {
  const text = String(value || '').trim()
  if (!text) return true
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function defaultTaxRate(settings) {
  const enabled = (settings.taxRates || []).filter((row) => row.is_enabled !== false)
  const first = enabled[0] || settings.taxRates?.[0]
  return Number(first?.rate) || 0
}

export function applySettingsToRestaurant(restaurant, settings) {
  if (!restaurant || !settings) return restaurant
  const charge = (settings.serviceCharges || []).find((row) => row.is_enabled)
  const serviceRate = charge && charge.charge_type !== 'fixed' ? Number(charge.value) || 0 : 0
  return {
    ...restaurant,
    timezone: settings.timezone || restaurant.timezone || 'Asia/Kolkata',
    currency: settings.currency || restaurant.currency || 'INR',
    tax_enabled: settings.tax_enabled === true,
    tax_mode: settings.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive',
    tax_rate: defaultTaxRate(settings),
    service_charge_rate: serviceRate,
  }
}

export function validateSettings(form) {
  const errors = {}
  if (!String(form.name || '').trim()) errors.name = 'Restaurant name is required.'
  if (!String(form.phone || '').trim()) errors.phone = 'Phone is required.'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email.'
  if (form.gstin && !/^[0-9A-Z]{15}$/i.test(String(form.gstin).trim())) errors.gstin = 'GSTIN should be 15 characters.'
  if (!isHttpUrl(form.website)) errors.website = 'Enter a valid website URL.'
  if (!isHttpUrl(form.facebook)) errors.facebook = 'Enter a valid Facebook URL.'
  if (!isHttpUrl(form.instagram)) errors.instagram = 'Enter a valid Instagram URL.'
  if (!isHttpUrl(form.google_maps)) errors.google_maps = 'Enter a valid Maps URL.'
  if (form.tax_enabled) {
    const rate = defaultTaxRate(form)
    if (!(rate >= 0 && rate <= 100)) errors.tax = 'Tax rate must be between 0 and 100.'
  }
  const upi = (form.payments || []).find((row) => row.method === 'upi')
  if (upi?.is_enabled && upi.upi_id && !/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(String(upi.upi_id).trim())) {
    errors.upi = 'Enter a valid UPI ID.'
  }
  return errors
}

export function sectionDefaults(section, restaurant, user) {
  const base = emptySettings(restaurant, user)
  if (section === 'profile') {
    return {
      restaurant_type: base.restaurant_type,
      owner_name: base.owner_name,
      email: base.email,
      alternate_phone: base.alternate_phone,
      gstin: base.gstin,
      fssai: base.fssai,
      city: base.city,
      state: base.state,
      pin: base.pin,
      timezone: base.timezone,
      currency: base.currency,
      hours: defaultWorkingHours(),
    }
  }
  if (section === 'branding') {
    return {
      primary_color: base.primary_color,
      secondary_color: base.secondary_color,
      mark_url: '',
      website: '',
      facebook: '',
      instagram: '',
      google_maps: '',
      tagline: '',
      thank_you_message: base.thank_you_message,
      terms: '',
    }
  }
  if (section === 'tax') {
    return {
      tax_enabled: false,
      tax_mode: 'exclusive',
      rounding: 'none',
      taxRates: defaultTaxRates(),
      serviceCharges: defaultServiceCharges(),
    }
  }
  if (section === 'payments') return { payments: defaultPaymentMethods() }
  if (section === 'kot') return { kot: defaultKot() }
  if (section === 'bill') return { bill: defaultBill() }
  if (section === 'printers') return { printers: defaultPrinters() }
  if (section === 'permissions') return { roles: defaultRoles() }
  if (section === 'qr') return { qr: defaultQr() }
  if (section === 'orders') return { orders: defaultOrders() }
  if (section === 'floor') return { floor: defaultFloor() }
  if (section === 'kitchen') return { kitchen: defaultKitchen() }
  if (section === 'discounts') return { discounts: defaultDiscounts() }
  if (section === 'waiters') return { waiters: defaultWaiterPrefs() }
  if (section === 'notifications') return { notifications: defaultNotifications() }
  if (section === 'security') return { security: defaultSecurity() }
  if (section === 'advanced') return { advanced: defaultAdvanced() }
  return {}
}

export function formatMoneyPreview(value, currency = 'INR') {
  const amount = Number(value) || 0
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  } catch {
    return `₹${amount.toFixed(2)}`
  }
}
