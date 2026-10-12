export const SUPPORT_TABS = [
  { id: 'dashboard', label: 'Support Dashboard' },
  { id: 'tickets', label: 'Support Tickets' },
  { id: 'health', label: 'Restaurant System Health' },
  { id: 'releases', label: 'Updates & Releases' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'usage', label: 'Usage Analytics' },
  { id: 'help', label: 'Help & Guides' },
  { id: 'feedback', label: 'Feedback' },
]

export const TICKET_CATEGORIES = [
  { id: 'orders_tables', label: 'Orders & Tables' },
  { id: 'waiter_login', label: 'Waiter Login' },
  { id: 'kot_kitchen', label: 'KOT / Kitchen' },
  { id: 'billing_payments', label: 'Billing & Payments' },
  { id: 'printing', label: 'Printing' },
  { id: 'reports_exports', label: 'Reports & Exports' },
  { id: 'menu_categories', label: 'Menu & Categories' },
  { id: 'settings', label: 'Settings' },
  { id: 'other', label: 'Other' },
]

export const TICKET_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

export const TICKET_STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting_customer', label: 'Waiting for Customer' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
]

export const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'waiting_customer']
export const RESOLVED_TICKET_STATUSES = ['resolved', 'closed']

export const REMINDER_STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const REMINDER_RECURRENCE = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

export const FEEDBACK_TYPES = [
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'issue', label: 'Issue' },
  { id: 'praise', label: 'Praise' },
  { id: 'other', label: 'Other' },
]

export const FEEDBACK_MODULES = [
  { id: 'getting_started', label: 'Getting Started' },
  { id: 'menu', label: 'Menu Management' },
  { id: 'tables', label: 'Floor / Tables' },
  { id: 'waiters', label: 'Waiter Management' },
  { id: 'orders_kot', label: 'Orders & KOT' },
  { id: 'billing', label: 'Billing & Split Payments' },
  { id: 'reports', label: 'Collections & Reports' },
  { id: 'qr', label: 'QR / Digital Menu' },
  { id: 'printers', label: 'Printer Setup' },
  { id: 'settings', label: 'Restaurant Settings' },
  { id: 'other', label: 'Other' },
]

export const USAGE_RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'custom', label: 'Custom' },
]

export const HELP_CATEGORIES = [
  {
    id: 'getting_started',
    label: 'Getting Started',
    articles: [
      {
        id: 'gs-setup',
        title: 'Set up the restaurant profile',
        body: 'Open Restaurant in the owner dashboard and save name, phone, address and logo. The public menu URL is based on the restaurant slug in Settings.',
      },
      {
        id: 'gs-switch',
        title: 'Switch between restaurants',
        body: 'Use the restaurant switcher in the sidebar. Support tickets, health, usage and reminders always follow the selected restaurant.',
      },
    ],
  },
  {
    id: 'menu',
    label: 'Menu Management',
    articles: [
      {
        id: 'menu-cats',
        title: 'Categories and items',
        body: 'Create categories first, then add menu items with price, food type and availability. Sold-out items stay on the menu but cannot be ordered.',
      },
    ],
  },
  {
    id: 'tables',
    label: 'Floor / Tables',
    articles: [
      {
        id: 'tables-floor',
        title: 'Tables and sessions',
        body: 'Manage tables under Table-wise order → Floor / Tables. Opening a table starts a session. Merge and transfer stay inside that restaurant.',
      },
    ],
  },
  {
    id: 'waiters',
    label: 'Waiter Management',
    articles: [
      {
        id: 'waiters-login',
        title: 'Waiter login',
        body: 'Create waiters and assign tables in Table-wise order → Waiters. Waiters sign in at /waiter/login. Owner accounts cannot use the waiter app.',
      },
    ],
  },
  {
    id: 'orders_kot',
    label: 'Orders & KOT',
    articles: [
      {
        id: 'orders-flow',
        title: 'Orders and kitchen tickets',
        body: 'Waiters submit orders from an open session. Each committed order creates a KOT. Kitchen status is updated in Kitchen / KOT and does not change payments.',
      },
    ],
  },
  {
    id: 'billing',
    label: 'Billing & Split Payments',
    articles: [
      {
        id: 'billing-split',
        title: 'Bills and split payments',
        body: 'Running Bills shows the session bill. Discounts, tax and split payments apply to that bill only. Printing a bill does not settle it.',
      },
    ],
  },
  {
    id: 'reports',
    label: 'Collections & Reports',
    articles: [
      {
        id: 'reports-export',
        title: 'Collections and order history',
        body: 'Collections and Order History can export CSV/Excel/PDF for the selected restaurant. Those files are data extracts, not database backups.',
      },
    ],
  },
  {
    id: 'qr',
    label: 'QR / Digital Menu',
    articles: [
      {
        id: 'qr-studio',
        title: 'Public menu and table QR',
        body: 'QR Studio builds the public menu link from the restaurant slug. Table QR codes append a table token. Changing the slug breaks printed codes.',
      },
    ],
  },
  {
    id: 'printers',
    label: 'Printer Setup',
    articles: [
      {
        id: 'print-setup',
        title: 'Printer profiles vs hardware',
        body: 'Printer Settings stores profiles and routes. Browser/system print can open a dialog. This app cannot confirm that a physical printer is online unless a hardware integration exists.',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Restaurant Settings',
    articles: [
      {
        id: 'settings-scope',
        title: 'Restaurant-scoped settings',
        body: 'Tax, payments, KOT, bill and printer settings belong to the selected restaurant. Production / Go Live is a readiness dashboard, not a hosting control panel.',
      },
    ],
  },
]

export function catalogLabel(list, id) {
  return list.find((row) => row.id === id)?.label || id || '—'
}

export function statusTone(status) {
  if (status === 'open' || status === 'operational' || status === 'completed' || status === 'generated' || status === 'pass') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  }
  if (status === 'in_progress' || status === 'waiting_customer' || status === 'warning' || status === 'warn') {
    return 'border-amber-200 bg-amber-50 text-amber-950'
  }
  if (status === 'failed' || status === 'fail' || status === 'cancelled' || status === 'high') {
    return 'border-red-200 bg-red-50 text-red-800'
  }
  if (status === 'resolved' || status === 'closed' || status === 'medium') {
    return 'border-line bg-paper text-ink'
  }
  return 'border-line bg-white text-muted'
}

export function healthTone(status) {
  if (status === 'operational') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-950'
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800'
  if (status === 'manual') return 'border-line bg-paper text-ink'
  return 'border-line bg-white text-muted'
}

export function healthLabel(status) {
  if (status === 'operational') return 'Operational'
  if (status === 'warning') return 'Warning'
  if (status === 'failed') return 'Failed'
  if (status === 'manual') return 'Manual Verification Required'
  return 'Not Checked'
}

export function priorityTone(priority) {
  if (priority === 'high') return 'border-red-200 bg-red-50 text-red-800'
  if (priority === 'medium') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-line bg-paper text-ink'
}

export function emptyTicketForm() {
  return {
    subject: '',
    category: 'orders_tables',
    description: '',
    priority: 'medium',
  }
}

export function emptyReminderForm() {
  const due = new Date()
  due.setDate(due.getDate() + 1)
  due.setMinutes(0, 0, 0)
  const local = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  return {
    task: '',
    description: '',
    due_at: local,
    recurrence: 'none',
  }
}

export function emptyFeedbackForm() {
  return {
    feedback_type: 'suggestion',
    rating: '',
    message: '',
    related_module: 'other',
  }
}

function zonedParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function utcFromZoned(parts, timeZone) {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const asZone = zonedParts(new Date(guess), timeZone)
  const offset =
    Date.UTC(asZone.year, asZone.month - 1, asZone.day, asZone.hour, asZone.minute, asZone.second) - guess
  return new Date(guess - offset)
}

export function supportRange(preset, custom = {}, timeZone = 'Asia/Kolkata') {
  const now = new Date()
  const parts = zonedParts(now, timeZone)
  const startToday = utcFromZoned({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone)
  const startTomorrow = utcFromZoned({
    year: parts.year,
    month: parts.month,
    day: parts.day + 1,
    hour: 0,
    minute: 0,
    second: 0,
  }, timeZone)

  if (preset === '7d') {
    const from = new Date(startTomorrow.getTime() - 7 * 86400000)
    return { id: '7d', from, to: startTomorrow }
  }
  if (preset === '30d') {
    const from = new Date(startTomorrow.getTime() - 30 * 86400000)
    return { id: '30d', from, to: startTomorrow }
  }
  if (preset === 'custom') {
    const fromParts = String(custom.from || '').split('-').map(Number)
    const toParts = String(custom.to || custom.from || '').split('-').map(Number)
    const from = utcFromZoned({
      year: fromParts[0] || parts.year,
      month: fromParts[1] || parts.month,
      day: fromParts[2] || parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    }, timeZone)
    const toDay = utcFromZoned({
      year: toParts[0] || parts.year,
      month: toParts[1] || parts.month,
      day: (toParts[2] || parts.day) + 1,
      hour: 0,
      minute: 0,
      second: 0,
    }, timeZone)
    return { id: 'custom', from, to: toDay <= from ? new Date(from.getTime() + 86400000) : toDay }
  }
  return { id: 'today', from: startToday, to: startTomorrow }
}

export function monthRange(timeZone = 'Asia/Kolkata') {
  const now = new Date()
  const parts = zonedParts(now, timeZone)
  const from = utcFromZoned({ year: parts.year, month: parts.month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone)
  const to = utcFromZoned({ year: parts.year, month: parts.month + 1, day: 1, hour: 0, minute: 0, second: 0 }, timeZone)
  return { from, to }
}

export function formatSupportDate(value, timeZone) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      timeZone: timeZone || undefined,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function formatSupportDateTime(value, timeZone) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-IN', {
      timeZone: timeZone || undefined,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function localDateInput(value = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = zonedParts(value, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
