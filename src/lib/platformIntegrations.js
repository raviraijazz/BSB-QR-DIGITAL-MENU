export const INTEGRATION_STATUSES = {
  connected: { label: 'Connected', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  setup_required: { label: 'Setup required', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  error: { label: 'Error', className: 'bg-red-50 text-red-700 border-red-200' },
  disabled: { label: 'Disabled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  not_configured: { label: 'Not configured', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  not_implemented: { label: 'Not implemented', className: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export const INTEGRATION_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'menu_import', label: 'Menu Import' },
  { id: 'payments', label: 'Payments' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'apis', label: 'APIs' },
]

const SECRET_KEY_RE = /(token|secret|password|passwd|api[_-]?key|authorization|bearer|service[_-]?role|refresh[_-]?token|access[_-]?token|webhook[_-]?secret|private[_-]?key)/i

export const INTEGRATION_PROVIDERS = [
  {
    id: 'google_sheets',
    name: 'Google Sheets / CSV',
    category: 'menu_import',
    purpose: 'Load a public Google Sheet or CSV and import dishes into one existing restaurant.',
    implemented: true,
    testable: true,
    secretsRequired: [],
    existingRoute: '/platform-admin/import-menu',
    existingRouteLabel: 'Open menu import',
    auditActions: ['menu_import', 'integration_test'],
    instructions: [
      'Use the existing Import Menu page. This hub does not add a second importer.',
      'Paste a Google Sheets URL that is shared with anyone with the link, or upload a CSV export.',
      'No Google API key or OAuth token is stored. The Founder Console fetches a public CSV export through the platform-admin Edge Function.',
      'Import is scoped to the restaurant you select. Existing items are never deleted or overwritten.',
      'Private sheets return a share error. Upload a CSV export instead of adding credentials here.',
    ],
    remaining: [],
  },
  {
    id: 'whatsapp_business',
    name: 'WhatsApp Business',
    category: 'notifications',
    purpose: 'Send operational or support messages through the WhatsApp Business Platform.',
    implemented: false,
    testable: false,
    secretsRequired: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    instructions: [
      'The public site and Global Settings only store a support phone number for wa.me links.',
      'That is not WhatsApp Business API. No templates, inbound webhooks, or message sends exist in this codebase.',
    ],
    remaining: [
      'Meta WhatsApp Cloud API access token and phone-number ID, stored only as Edge Function secrets.',
      'A server-side send/receive Edge Function authorized with platform_require_admin or restaurant-scoped staff checks.',
      'Template / message audit that never logs access tokens.',
    ],
  },
  {
    id: 'payment_gateway',
    name: 'Payment gateway',
    category: 'payments',
    purpose: 'Collect restaurant or subscription payments through a third-party gateway.',
    implemented: false,
    testable: false,
    secretsRequired: ['PAYMENT_GATEWAY_KEY', 'PAYMENT_GATEWAY_SECRET'],
    instructions: [
      'Restaurant bills record cash, UPI, and card locally. Founder subscription invoices are also recorded manually.',
      'There is no Razorpay, Stripe, Paytm, or PhonePe integration and no checkout session in this repository.',
    ],
    remaining: [
      'A chosen gateway account and secret keys stored only as Edge Function secrets.',
      'Server-side order/payment verification that never exposes the secret key to the browser.',
      'Webhook signature verification before marking a bill or invoice paid.',
    ],
  },
  {
    id: 'email_smtp',
    name: 'Email / SMTP',
    category: 'notifications',
    purpose: 'Send transactional email such as invoices or owner notices.',
    implemented: false,
    testable: false,
    secretsRequired: ['SMTP_PASSWORD', 'SMTP_HOST'],
    instructions: [
      'Global Settings stores a support email address for display and mailto links only.',
      'No SMTP, SendGrid, Resend, or other mail provider is configured or called.',
    ],
    remaining: [
      'SMTP or transactional-email credentials stored only as Edge Function secrets.',
      'A server-side send function with founder authorization.',
      'Delivery logs that store recipient and subject, never the SMTP password.',
    ],
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    category: 'apis',
    purpose: 'Push platform events to a registered HTTPS endpoint.',
    implemented: false,
    testable: false,
    secretsRequired: ['WEBHOOK_SIGNING_SECRET'],
    instructions: [
      'This project has no webhook registry, delivery worker, retry queue, or signing secret.',
      'No endpoint can be registered until a server-side delivery mechanism exists. The UI will not pretend to send events.',
    ],
    remaining: [
      'A delivery Edge Function or worker with SSRF protections (HTTPS only, no private/link-local hosts).',
      'Registered endpoints, event types, signing secret, and retry policy stored without exposing the secret.',
      'Delivery logs with status codes and safe error text.',
    ],
  },
]

export function providerById(id) {
  return INTEGRATION_PROVIDERS.find((row) => row.id === String(id || '')) || null
}

export function redactSecrets(value, depth = 0) {
  if (depth > 6) return '[truncated]'
  if (value == null) return value
  if (typeof value === 'string') {
    if (/^(sk_|rk_|whsec_|xox[baprs]-|ghp_|glpat-|Bearer\s)/i.test(value.trim())) return '[redacted]'
    return value
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1))
  if (typeof value === 'object') {
    const next = {}
    for (const [key, item] of Object.entries(value)) {
      next[key] = SECRET_KEY_RE.test(key) ? '[redacted]' : redactSecrets(item, depth + 1)
    }
    return next
  }
  return value
}

export function safeErrorMessage(error) {
  const raw = String(error?.message || error || '').trim()
  if (!raw) return 'Request failed'
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .replace(/sk_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/service[_-]?role[^\s,;]*/gi, '[redacted]')
}

export function isGoogleSheetUrl(url) {
  const value = String(url || '').trim()
  if (!/^https:\/\//i.test(value)) return false
  return /^https:\/\/(docs\.google\.com|drive\.google\.com|docs\.googleusercontent\.com)\//i.test(value)
}

export function parseGoogleSheetRef(url) {
  const value = String(url || '').trim()
  if (/export\?format=csv/i.test(value) || /tqx=out:csv/i.test(value)) {
    const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    const gidMatch = value.match(/[#&?]gid=([0-9]+)/)
    return {
      spreadsheetId: match ? match[1] : '',
      gid: gidMatch ? gidMatch[1] : '0',
      exportUrl: value,
    }
  }
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return null
  const gidMatch = value.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return {
    spreadsheetId: match[1],
    gid,
    exportUrl: `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`,
  }
}

export function sheetCsvCandidates(url) {
  const ref = parseGoogleSheetRef(url)
  if (!ref) return []
  const urls = [ref.exportUrl]
  if (ref.spreadsheetId && !/tqx=out:csv/i.test(ref.exportUrl)) {
    urls.push(`https://docs.google.com/spreadsheets/d/${ref.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${ref.gid}`)
  }
  return [...new Set(urls)]
}

export function validateSheetTestUrl(url) {
  const value = String(url || '').trim()
  if (!value) return 'Paste a Google Sheets URL first.'
  if (!isGoogleSheetUrl(value)) return 'Only public Google Sheets URLs can be tested here. Upload a CSV on Import Menu for other files.'
  if (!parseGoogleSheetRef(value)) return 'Could not read a spreadsheet ID from that URL.'
  return ''
}

function timeMs(value) {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

export function activityForProvider(provider, rows) {
  const list = Array.isArray(rows) ? rows : []
  const mine = list.filter((row) => {
    if (!row) return false
    if (row.provider) return row.provider === provider.id
    if (row.action === 'integration_test') return row.details?.provider === provider.id
    return (provider.auditActions || []).includes(row.action)
  })
  const successes = mine.filter((row) => row.ok === true || row.action === 'menu_import')
  const failures = mine.filter((row) => row.ok === false)
  const lastSuccess = successes.sort((a, b) => timeMs(b.created_at) - timeMs(a.created_at))[0] || null
  const lastError = failures.sort((a, b) => timeMs(b.created_at) - timeMs(a.created_at))[0] || null
  return { rows: mine, lastSuccess, lastError }
}

export function deriveIntegrationStatus(provider, { lastSuccess, lastError, enabled = true, logsUnavailable = false } = {}) {
  if (!provider) return 'not_implemented'
  if (!provider.implemented) return 'not_implemented'
  if (enabled === false) return 'disabled'
  const successAt = timeMs(lastSuccess?.created_at)
  const errorAt = timeMs(lastError?.created_at)
  if (errorAt && errorAt >= successAt) return 'error'
  if (successAt) return 'connected'
  if ((provider.secretsRequired || []).length) return 'setup_required'
  return 'not_configured'
}

export function filterProviders(providers, { search = '', category = 'all', statusMap = {} } = {}) {
  const needle = String(search || '').trim().toLowerCase()
  return (providers || []).filter((row) => {
    if (category && category !== 'all' && row.category !== category) return false
    if (!needle) return true
    const status = statusMap[row.id] || deriveIntegrationStatus(row)
    const hay = `${row.name} ${row.purpose} ${row.id} ${status}`.toLowerCase()
    return hay.includes(needle)
  })
}

export function testResultDetails({ ok, message, rowCount }) {
  return redactSecrets({
    provider: 'google_sheets',
    ok: Boolean(ok),
    message: safeErrorMessage(message),
    row_count: Number.isFinite(Number(rowCount)) ? Number(rowCount) : null,
  })
}

export function logsState({ error, loaded, rows }) {
  if (error) return 'unavailable'
  if (!loaded) return 'loading'
  if (!rows?.length) return 'empty'
  return 'ready'
}
