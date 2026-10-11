import { QA_CHECKS } from './qaCatalog'
import { countResults, productionGate, scorePercent } from './qaRunner'
import { hasSupabaseConfig } from './supabase'
import { QA_SQL_FILES } from './qaManifest'

export const APP_VERSION = '1.0.0'
export const DEPLOY_PROVIDER = 'Vercel'
export const DEPLOY_PROVIDER_URL = 'https://vercel.com/dashboard'
export const SUPABASE_DASHBOARD_URL = 'https://supabase.com/dashboard'

export const CARD_IDS = ['deployment', 'environment', 'database', 'security', 'readiness']

export const GO_LIVE_ITEMS = [
  { id: 'build', label: 'Production build successful', ids: ['dep-build-mode', 'dep-manual-build'] },
  { id: 'migrations', label: 'Required migrations applied', ids: ['int-schema-core', 'int-schema-tablewise', 'int-schema-settings', 'int-schema-print', 'int-rpc-payment'] },
  { id: 'rls', label: 'RLS policies verified', ids: ['sec-rls-bills', 'sec-rls-payments', 'sec-rls-orders', 'sec-rls-waiters', 'sec-owner-scope'] },
  { id: 'env', label: 'Environment configuration verified', ids: ['int-supabase', 'sec-anon-only', 'sec-env-surface'] },
  { id: 'owner-login', label: 'Owner login tested', ids: ['feat-owner-auth', 'uat-owner-login'] },
  { id: 'waiter-login', label: 'Waiter login tested', ids: ['uat-waiter-login'] },
  { id: 'isolation', label: 'Restaurant isolation tested', ids: ['mt-query-filter', 'sec-owner-scope', 'mt-switcher'] },
  { id: 'orders-kot', label: 'Orders and KOT tested', ids: ['feat-orders', 'feat-kots', 'uat-order-flow'] },
  { id: 'tax', label: 'Discount/tax calculations tested', ids: ['fin-discount-percent', 'fin-tax-exclusive', 'fin-split-payments'] },
  { id: 'payments', label: 'Single and split payments tested', ids: ['feat-payments', 'fin-split-payments', 'intg-open-overpay'] },
  { id: 'settlement', label: 'Settlement/session closure tested', ids: ['intg-paid-balance', 'uat-settle-print'] },
  { id: 'reports', label: 'Reports and history tested', ids: ['feat-history', 'feat-collections', 'uat-reprint-history'] },
  { id: 'settings', label: 'Settings integration verified', ids: ['feat-settings', 'set-tax-runtime', 'set-validation'] },
  { id: 'kot-print', label: 'KOT printing tested', ids: ['print-jobs-table', 'print-kot-routing'] },
  { id: 'bill-print', label: 'Bill/receipt printing tested', ids: ['print-auto-after-settle', 'print-reprint-flag', 'print-failure-isolated'] },
  { id: 'backup', label: 'Backup process verified', ids: [] },
  { id: 'domain', label: 'Domain/HTTPS verified', ids: [] },
  { id: 'monitoring', label: 'Monitoring reviewed', ids: [] },
]

const CARD_CHECKS = {
  deployment: ['dep-build-mode', 'dep-manual-build', 'dep-preview-hosts', 'dep-env-example', 'dep-sql-files'],
  environment: ['int-supabase', 'sec-anon-only', 'sec-env-surface', 'set-timezone', 'set-payments-enabled'],
  database: [
    'int-schema-core', 'int-schema-tablewise', 'int-schema-settings', 'int-schema-print',
    'int-rpc-payment', 'intg-bill-session', 'intg-payment-bill', 'intg-paid-balance', 'intg-open-overpay',
  ],
  security: [
    'sec-anon-only', 'sec-env-surface', 'sec-owner-scope', 'sec-rls-bills', 'sec-rls-payments',
    'sec-rls-orders', 'sec-rls-waiters', 'sec-protected-routes', 'mt-query-filter',
  ],
}

export function resultById(results) {
  return Object.fromEntries((results || []).map((row) => [row.id, row]))
}

export function worstStatus(statuses) {
  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.includes('manual') || statuses.includes('skip')) return 'manual'
  if (statuses.includes('pass')) return 'pass'
  return 'unchecked'
}

export function statusLabel(status) {
  if (status === 'pass') return 'Passed'
  if (status === 'fail') return 'Failed'
  if (status === 'warn') return 'Warning'
  if (status === 'skip') return 'Not checked'
  if (status === 'unchecked') return 'Not checked'
  return 'Manual verification required'
}

export function goLiveGate(results) {
  if (!results?.length) {
    return {
      id: 'verify',
      label: 'Verification Required',
      detail: 'Run the QA suite. No checks have been executed in this session.',
    }
  }
  const rows = results
  const criticalFails = rows.filter((row) => row.severity === 'critical' && row.status === 'fail')
  const integrityFails = rows.filter((row) => row.tab === 'integrity' && row.status === 'fail')
  const securityFails = rows.filter((row) => row.tab === 'security' && row.status === 'fail')
  const buildFail = rows.find((row) => row.id === 'dep-manual-build' && row.status === 'fail')
  const anyFail = rows.filter((row) => row.status === 'fail')
  const criticalManual = rows.filter((row) => row.severity === 'critical' && (row.status === 'manual' || row.status === 'skip'))
  if (criticalFails.length || integrityFails.length || securityFails.length || buildFail) {
    const bits = []
    if (securityFails.length) bits.push(`${securityFails.length} security failure${securityFails.length === 1 ? '' : 's'}`)
    if (integrityFails.length) bits.push(`${integrityFails.length} data-integrity failure${integrityFails.length === 1 ? '' : 's'}`)
    if (buildFail) bits.push('production build failed')
    if (!bits.length) bits.push(`${criticalFails.length} critical failure${criticalFails.length === 1 ? '' : 's'}`)
    return { id: 'not-ready', label: 'Not Ready', detail: bits.join('. ') + '.' }
  }
  if (criticalManual.length) {
    return {
      id: 'verify',
      label: 'Verification Required',
      detail: `${criticalManual.length} critical check${criticalManual.length === 1 ? '' : 's'} still need manual verification.`,
    }
  }
  const base = productionGate(results)
  if (base.id === 'ready' && anyFail.length === 0) {
    return { id: 'ready', label: 'Ready for Production', detail: base.detail }
  }
  if (base.id === 'not-ready') return { ...base, label: 'Not Ready' }
  return { id: 'warnings', label: 'Ready with Warnings', detail: base.detail }
}

function pick(map, ids) {
  return ids.map((id) => map[id]).filter(Boolean)
}

export function cardSummary(id, results, extras = {}) {
  const map = resultById(results)
  const rows = pick(map, CARD_CHECKS[id] || [])
  const statuses = rows.map((row) => row.status)
  if (id === 'deployment' && extras.buildMode) statuses.push(extras.buildMode)
  if (id === 'environment' && extras.envConfigured) statuses.push(extras.envConfigured)
  if (!results?.length && id !== 'environment' && id !== 'deployment') {
    return { id, status: 'unchecked', counts: countResults([]), rows: [] }
  }
  return {
    id,
    status: worstStatus(statuses.length ? statuses : ['unchecked']),
    counts: countResults(rows),
    rows,
  }
}

export function checklistItems(results, extras = {}) {
  const map = resultById(results)
  return GO_LIVE_ITEMS.map((item) => {
    if (item.id === 'backup') {
      return { ...item, status: 'manual', message: 'No backup integration is connected. Use the Supabase dashboard backup/PITR process.' }
    }
    if (item.id === 'monitoring') {
      return { ...item, status: 'manual', message: 'Monitoring integration required. No uptime, error-rate or health endpoint is configured.' }
    }
    if (item.id === 'domain') {
      return { ...item, status: extras.httpsStatus || 'manual', message: extras.httpsMessage || 'Confirm HTTPS and the custom domain in the Vercel dashboard.' }
    }
    const rows = pick(map, item.ids)
    if (!rows.length) {
      return { ...item, status: results?.length ? 'unchecked' : 'unchecked', message: results?.length ? 'No mapped Phase 19 result.' : 'Not checked' }
    }
    const status = worstStatus(rows.map((row) => row.status))
    const failed = rows.find((row) => row.status === 'fail')
    const manual = rows.find((row) => row.status === 'manual' || row.status === 'skip')
    const warn = rows.find((row) => row.status === 'warn')
    const message = failed?.message || warn?.message || manual?.message || rows[0]?.message || ''
    return { ...item, status, message, rows }
  })
}

export function supabaseProjectRef() {
  const raw = String(import.meta.env.VITE_SUPABASE_URL || '')
  try {
    const host = new URL(raw).hostname
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

export function supabaseDashboardUrl() {
  const ref = supabaseProjectRef()
  return ref ? `${SUPABASE_DASHBOARD_URL}/project/${ref}` : SUPABASE_DASHBOARD_URL
}

export function sqlFileCount() {
  return Object.keys(QA_SQL_FILES || {}).length
}

export function safeRuntime(restaurant) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const protocol = typeof window !== 'undefined' ? window.location.protocol : ''
  const host = typeof window !== 'undefined' ? window.location.host : ''
  const prod = Boolean(import.meta.env.PROD)
  const mode = String(import.meta.env.MODE || (prod ? 'production' : 'development'))
  const https = protocol === 'https:'
  return {
    version: APP_VERSION,
    mode,
    prod,
    debug: Boolean(import.meta.env.DEV),
    supabaseConfigured: hasSupabaseConfig,
    supabaseHostSet: Boolean(import.meta.env.VITE_SUPABASE_URL),
    anonKeySet: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
    origin,
    host,
    protocol,
    https,
    httpsStatus: https ? 'pass' : (protocol === 'http:' ? 'warn' : 'manual'),
    httpsMessage: https
      ? `This session is HTTPS on ${host}. Certificate expiry is not readable from the browser.`
      : protocol === 'http:'
        ? `This session is HTTP on ${host}. Confirm the Vercel domain has HTTPS before go-live.`
        : 'HTTPS cannot be verified in this session.',
    timezone: restaurant?.timezone || restaurant?.time_zone || '',
    currency: restaurant?.currency || 'INR',
    restaurantName: restaurant?.name || '',
    restaurantId: restaurant?.id || '',
    provider: DEPLOY_PROVIDER,
    providerUrl: DEPLOY_PROVIDER_URL,
    supabaseDashboard: supabaseDashboardUrl(),
    commit: String(import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || '',
    vercelEnv: String(import.meta.env.VITE_VERCEL_ENV || ''),
    sqlFiles: sqlFileCount(),
  }
}

export function goLiveSummary(results, restaurant) {
  const runtime = safeRuntime(restaurant)
  const counts = countResults(results)
  const gate = goLiveGate(results)
  const extras = {
    buildMode: runtime.prod ? 'pass' : 'warn',
    envConfigured: runtime.supabaseConfigured ? 'pass' : 'fail',
    httpsStatus: runtime.httpsStatus,
    httpsMessage: runtime.httpsMessage,
  }
  const cards = {
    deployment: cardSummary('deployment', results, extras),
    environment: cardSummary('environment', results, extras),
    database: cardSummary('database', results),
    security: cardSummary('security', results),
    readiness: {
      id: 'readiness',
      status: gate.id === 'ready' ? 'pass' : gate.id === 'not-ready' ? 'fail' : gate.id === 'warnings' ? 'warn' : 'manual',
      counts,
      rows: [],
    },
  }
  if (!results?.length) {
    cards.deployment.status = runtime.prod ? 'warn' : 'manual'
    cards.environment.status = runtime.supabaseConfigured ? 'pass' : 'fail'
  }
  return {
    runtime,
    counts,
    score: scorePercent(counts),
    gate,
    cards,
    checklist: checklistItems(results, extras),
    failed: (results || []).filter((row) => row.status === 'fail'),
    warnings: (results || []).filter((row) => row.status === 'warn'),
    manual: (results || []).filter((row) => row.status === 'manual' || row.status === 'skip'),
    catalogSize: QA_CHECKS.length,
  }
}
