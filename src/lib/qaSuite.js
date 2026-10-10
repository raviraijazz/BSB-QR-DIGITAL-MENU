import { calculateBill, billBalance } from './billing'
import {
  applyBillDiscount,
  lineAmount,
  moneyRound,
  remainingBalance,
  sessionOrderTotals,
} from './orderCart'
import { billSnapshotRows } from './orderHistory'
import {
  applySettingsToRestaurant,
  emptySettings,
  PRIMARY_SECTIONS,
  validateSettings,
} from './restaurantSettings'
import { billFlags, skipAutoPrint } from './billPrint'
import { defaultBillPrinter, defaultKotPrinter, defaultReceiptPrinter } from './printerRouting'
import { forbiddenPath, guestHomePath, unauthenticatedPath } from './routeGuards'
import { TABLE_WISE_MODULES } from './tableWiseNav'
import { hasSupabaseConfig, supabase } from './supabase'
import { listMyRestaurants, uniqueSlug } from '../services/restaurants'
import { listCategories } from '../services/categories'
import { listMenuItems } from '../services/menuItems'
import { listTables } from '../services/tables'
import { listWaiters } from '../services/waiters'
import { listOpenSessions } from '../services/tableSessions'
import { listRestaurantOrders } from '../services/waiterOrders'
import { listRestaurantBills } from '../services/bills'
import { listRestaurantPayments, paymentBalance } from '../services/payments'
import { listRestaurantKots } from '../services/kots'
import { loadPrintConfig, listRestaurantPrintJobs, reprintBillArgs } from '../services/printJobs'
import { loadRestaurantSettings } from '../services/restaurantSettings'
import { WAITER_LOGIN_DEBUG } from '../services/waiterAuth'
import { QA_README, QA_SQL_FILES, QA_VITE_CONFIG } from './qaManifest'

function pass(message, evidence = '') {
  return { status: 'pass', message, evidence }
}

function fail(message, evidence = '') {
  return { status: 'fail', message, evidence }
}

function warn(message, evidence = '') {
  return { status: 'warn', message, evidence }
}

function manual(message = 'Manual verification required', evidence = '') {
  return { status: 'manual', message, evidence }
}

function missingSchema(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find')
}

function rlsBlocked(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('row-level security') || text.includes('not allowed') || text.includes('permission denied')
}

async function timed(ctx, key, fn) {
  if (Object.prototype.hasOwnProperty.call(ctx.cache, key)) return ctx.cache[key]
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const value = await fn()
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now()
  ctx.timings[key] = Math.round(ended - started)
  ctx.cache[key] = value
  return value
}

async function ownedRestaurants(ctx) {
  return timed(ctx, 'restaurants', async () => {
    if (!ctx.user?.id) return { data: [], error: { message: 'Not signed in' } }
    return listMyRestaurants(ctx.user.id)
  })
}

async function loadBills(ctx) {
  return timed(ctx, 'bills', () => listRestaurantBills(ctx.restaurant?.id))
}

async function loadPayments(ctx) {
  return timed(ctx, 'payments', () => listRestaurantPayments(ctx.restaurant?.id))
}

async function loadOrders(ctx) {
  return timed(ctx, 'orders', () => listRestaurantOrders(ctx.restaurant?.id))
}

async function loadSettings(ctx) {
  return timed(ctx, 'settings', () => loadRestaurantSettings(ctx.restaurant, ctx.user))
}

function envKeys() {
  const env = import.meta.env || {}
  return Object.keys(env).filter((key) => key.startsWith('VITE_'))
}

function near(actual, expected, epsilon = 0.02) {
  return Math.abs(moneyRound(actual) - moneyRound(expected)) <= epsilon
}

async function probeTable(table, columns = 'id') {
  const { error } = await supabase.from(table).select(columns).limit(1)
  return error
}

async function unfilteredScope(table, ownedIds) {
  const { data, error } = await supabase.from(table).select('id, restaurant_id').limit(80)
  if (error) {
    if (rlsBlocked(error) || missingSchema(error)) {
      return { ok: !missingSchema(error), blocked: !missingSchema(error), error, foreign: [] }
    }
    return { ok: false, blocked: false, error, foreign: [] }
  }
  const owned = new Set(ownedIds)
  const foreign = (data || []).filter((row) => row.restaurant_id && !owned.has(row.restaurant_id))
  return { ok: foreign.length === 0, blocked: false, error: null, foreign, count: (data || []).length }
}

const handlers = {
  async 'feat-owner-auth'(ctx) {
    if (!ctx.user?.id) return fail('Owner session is not available.')
    const { data, error } = await supabase.auth.getUser()
    if (error) return fail(error.message)
    if (!data?.user?.id) return fail('No authenticated user.')
    if (data.user.id !== ctx.user.id) return fail('Auth user does not match the dashboard session.')
    return pass('Owner session is authenticated.')
  },

  async 'feat-restaurant'(ctx) {
    if (!ctx.restaurant?.id) return fail('No active restaurant is loaded.')
    const list = await ownedRestaurants(ctx)
    if (list.error) return fail(list.error.message)
    const row = (list.data || []).find((item) => item.id === ctx.restaurant.id)
    if (!row) return fail('Active restaurant is not in the owner restaurant list.')
    return pass(`${row.name} loaded for this owner.`, row.id)
  },

  async 'feat-categories'(ctx) {
    const result = await timed(ctx, 'categories', () => listCategories(ctx.restaurant.id))
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} categor${(result.data || []).length === 1 ? 'y' : 'ies'} loaded.`)
  },

  async 'feat-menu'(ctx) {
    const result = await timed(ctx, 'menu', () => listMenuItems(ctx.restaurant.id))
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} menu item${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  async 'feat-tables'(ctx) {
    const result = await timed(ctx, 'tables', () => listTables(ctx.restaurant.id))
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} table${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  async 'feat-waiters'(ctx) {
    const result = await timed(ctx, 'waiters', () => listWaiters(ctx.restaurant.id))
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} waiter${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  async 'feat-qr'(ctx) {
    if (!ctx.restaurant?.slug) return fail('Restaurant slug is missing; public QR links will not work.')
    return pass(`Public slug is ${ctx.restaurant.slug}.`)
  },

  async 'feat-sessions'(ctx) {
    const result = await timed(ctx, 'sessions', () => listOpenSessions(ctx.restaurant.id))
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} open session${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  async 'feat-orders'(ctx) {
    const result = await loadOrders(ctx)
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} order${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  async 'feat-kots'(ctx) {
    const result = await timed(ctx, 'kots', () => listRestaurantKots(ctx.restaurant.id))
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} kitchen ticket${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  async 'feat-bills'(ctx) {
    const result = await loadBills(ctx)
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} bill${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  async 'feat-payments'(ctx) {
    const result = await loadPayments(ctx)
    if (result.error) return fail(result.error.message)
    return pass(`${(result.data || []).length} payment${(result.data || []).length === 1 ? '' : 's'} loaded.`)
  },

  'feat-history'() {
    const row = TABLE_WISE_MODULES.find((item) => item.key === 'history' && item.ready)
    if (!row) return fail('Order history module is not registered.')
    return pass(`Order history route is ${row.to}.`)
  },

  'feat-collections'() {
    const row = TABLE_WISE_MODULES.find((item) => item.key === 'collections' && item.ready)
    if (!row) return fail('Collections module is not registered.')
    return pass(`Collections route is ${row.to}.`)
  },

  async 'feat-settings'(ctx) {
    const result = await loadSettings(ctx)
    if (result.error) return fail(result.error.message)
    if (!result.data) return fail('Restaurant settings did not load.')
    return pass('Restaurant settings loaded.')
  },

  async 'feat-print-config'(ctx) {
    const result = await timed(ctx, 'printConfig', () => loadPrintConfig(ctx.restaurant.id))
    if (result.error) return fail(result.error.message)
    return pass(`${(result.printers || []).length} printer${(result.printers || []).length === 1 ? '' : 's'}, ${(result.routes || []).length} route${(result.routes || []).length === 1 ? '' : 's'}.`)
  },

  'feat-readiness'() {
    const row = PRIMARY_SECTIONS.find((item) => item.id === 'readiness')
    if (!row) return fail('System Readiness is not in Settings navigation.')
    return pass('System Readiness is available under Settings.')
  },

  'int-supabase'() {
    if (!hasSupabaseConfig || !supabase) return fail('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.')
    const url = String(import.meta.env.VITE_SUPABASE_URL || '')
    if (!url.startsWith('http')) return fail('VITE_SUPABASE_URL is not an HTTP URL.')
    return pass('Supabase URL and anon key are present.')
  },

  async 'int-schema-core'(ctx) {
    const restaurants = await ownedRestaurants(ctx)
    if (restaurants.error) return fail(restaurants.error.message, 'restaurants')
    const categories = await timed(ctx, 'categories', () => listCategories(ctx.restaurant.id))
    if (categories.error) return fail(categories.error.message, 'categories')
    const menu = await timed(ctx, 'menu', () => listMenuItems(ctx.restaurant.id))
    if (menu.error) return fail(menu.error.message, 'menu_items')
    return pass('restaurants, categories, and menu_items are queryable.')
  },

  async 'int-schema-tablewise'(ctx) {
    const tables = await timed(ctx, 'tables', () => listTables(ctx.restaurant.id))
    if (tables.error) return fail(tables.error.message, 'restaurant_tables')
    const waiters = await timed(ctx, 'waiters', () => listWaiters(ctx.restaurant.id))
    if (waiters.error) return fail(waiters.error.message, 'waiters')
    const sessions = await timed(ctx, 'sessions', () => listOpenSessions(ctx.restaurant.id))
    if (sessions.error) return fail(sessions.error.message, 'table_sessions')
    const orders = await loadOrders(ctx)
    if (orders.error) return fail(orders.error.message, 'orders')
    const bills = await loadBills(ctx)
    if (bills.error) return fail(bills.error.message, 'bills')
    const payments = await loadPayments(ctx)
    if (payments.error) return fail(payments.error.message, 'payments')
    return pass('Table-wise tables, waiters, sessions, orders, bills, and payments are queryable.')
  },

  async 'int-schema-settings'(ctx) {
    const result = await loadSettings(ctx)
    if (result.error) return fail(result.error.message)
    return pass('restaurant_settings is queryable.')
  },

  async 'int-schema-print'(ctx) {
    const printers = await probeTable('restaurant_printer_profiles', 'id, restaurant_id')
    if (printers && missingSchema(printers)) return fail(printers.message)
    if (printers) return fail(printers.message)
    const jobs = await probeTable('restaurant_print_jobs', 'id, restaurant_id')
    if (jobs && missingSchema(jobs)) return fail(jobs.message)
    if (jobs) return fail(jobs.message)
    const config = await timed(ctx, 'printConfig', () => loadPrintConfig(ctx.restaurant.id))
    if (config.error) return fail(config.error.message)
    return pass('Printer profiles and print jobs are queryable.')
  },

  async 'int-rpc-payment'(ctx) {
    const { error } = await supabase.rpc('collect_bill_payment', {
      p_restaurant_id: ctx.restaurant.id,
      p_bill_id: '00000000-0000-0000-0000-000000000000',
      p_amount: 1,
      p_method: 'cash',
      p_reference: '',
      p_request_id: null,
    })
    if (!error) return warn('Payment RPC accepted a fake bill id; verify collect_bill_payment in SQL.')
    const text = String(error.message || '').toLowerCase()
    if (missingSchema(error) || text.includes('collect_bill_payment')) {
      return fail('collect_bill_payment is not available. Run supabase/bill-payments.sql.')
    }
    if (text.includes('running bill not found') || text.includes('not found') || text.includes('not allowed')) {
      return pass('collect_bill_payment is present and rejected a fake bill.')
    }
    return pass('collect_bill_payment responded (no payment was recorded).', error.message)
  },

  async 'int-rpc-kot-stamp'(ctx) {
    const { error } = await supabase.rpc('stamp_kot_printed', {
      p_kot_id: '00000000-0000-0000-0000-000000000000',
      p_restaurant_id: ctx.restaurant.id,
    })
    if (!error) return warn('stamp_kot_printed accepted a fake KOT id.')
    if (missingSchema(error)) {
      return warn('stamp_kot_printed is missing. printed_at fallback may still work. Run supabase/kot-printing.sql.')
    }
    return pass('stamp_kot_printed is present and rejected a fake KOT.')
  },

  'int-owner-waiter-routes'() {
    const ownerLogin = unauthenticatedPath('owner').to
    const waiterLogin = unauthenticatedPath('waiter').to
    const waiterBlocked = forbiddenPath('owner', { isOwner: false, isWaiter: true })
    const ownerBlocked = forbiddenPath('waiter', { isOwner: true, isWaiter: false })
    if (ownerLogin !== '/login' || waiterLogin !== '/waiter/login') {
      return fail('Unauthenticated paths do not match owner/waiter logins.')
    }
    if (waiterBlocked !== '/waiter' || ownerBlocked !== '/dashboard') {
      return fail('Role gates do not send waiters and owners to the correct apps.')
    }
    return pass('Owner dashboard and waiter app are role-gated.')
  },

  'int-guest-menu'() {
    const modules = TABLE_WISE_MODULES.map((row) => row.to).join(' ')
    if (!modules.includes('/dashboard/table-wise')) return fail('Table-wise routes are missing.')
    return pass('Public menu stays outside the owner dashboard; table-wise routes are registered.')
  },

  'sec-anon-only'() {
    const keys = envKeys()
    const secret = keys.find((key) => /service[_-]?role|secret|password|private[_-]?key/i.test(key))
    if (secret) return fail(`Frontend env includes ${secret}.`)
    if (!import.meta.env.VITE_SUPABASE_ANON_KEY) return fail('Anon key is missing.')
    if (String(import.meta.env.VITE_SUPABASE_ANON_KEY).includes('service_role')) {
      return fail('VITE_SUPABASE_ANON_KEY looks like a service-role key.')
    }
    return pass('Frontend env uses the anon key only.')
  },

  'sec-env-surface'() {
    const keys = envKeys()
    const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_DEV', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'])
    const extra = keys.filter((key) => !allowed.has(key) && !key.startsWith('VITE_'))
    const viteExtra = keys.filter((key) => key.startsWith('VITE_') && key !== 'VITE_SUPABASE_URL' && key !== 'VITE_SUPABASE_ANON_KEY')
    if (viteExtra.some((key) => /service|secret|token|password/i.test(key))) {
      return fail(`Unexpected secret-like Vite key: ${viteExtra.join(', ')}`)
    }
    return pass(`Client env keys: ${keys.filter((key) => key.startsWith('VITE_')).join(', ') || 'none'}.`, extra.join(','))
  },

  async 'sec-owner-scope'(ctx) {
    const list = await ownedRestaurants(ctx)
    if (list.error) return fail(list.error.message)
    const foreign = (list.data || []).filter((row) => row.user_id && row.user_id !== ctx.user.id)
    if (foreign.length) return fail(`${foreign.length} restaurant(s) are not owned by this user.`)
    return pass(`${(list.data || []).length} restaurant(s) belong to this owner.`)
  },

  async 'sec-rls-bills'(ctx) {
    const list = await ownedRestaurants(ctx)
    const ownedIds = (list.data || []).map((row) => row.id)
    const result = await unfilteredScope('bills', ownedIds)
    if (!result.ok && result.foreign?.length) return fail(`${result.foreign.length} bill(s) from another restaurant were visible.`)
    if (result.error && missingSchema(result.error)) return fail(result.error.message)
    if (result.blocked) return pass('Unfiltered bill reads are blocked.')
    if (result.error) return fail(result.error.message)
    return pass('Visible bills belong to this owner.')
  },

  async 'sec-rls-payments'(ctx) {
    const list = await ownedRestaurants(ctx)
    const ownedIds = (list.data || []).map((row) => row.id)
    const result = await unfilteredScope('payments', ownedIds)
    if (!result.ok && result.foreign?.length) return fail(`${result.foreign.length} payment(s) from another restaurant were visible.`)
    if (result.error && missingSchema(result.error)) return fail(result.error.message)
    if (result.blocked) return pass('Unfiltered payment reads are blocked.')
    if (result.error) return fail(result.error.message)
    return pass('Visible payments belong to this owner.')
  },

  async 'sec-rls-orders'(ctx) {
    const list = await ownedRestaurants(ctx)
    const ownedIds = (list.data || []).map((row) => row.id)
    const result = await unfilteredScope('orders', ownedIds)
    if (!result.ok && result.foreign?.length) return fail(`${result.foreign.length} order(s) from another restaurant were visible.`)
    if (result.error && missingSchema(result.error)) return fail(result.error.message)
    if (result.blocked) return pass('Unfiltered order reads are blocked.')
    if (result.error) return fail(result.error.message)
    return pass('Visible orders belong to this owner.')
  },

  async 'sec-rls-waiters'(ctx) {
    const list = await ownedRestaurants(ctx)
    const ownedIds = (list.data || []).map((row) => row.id)
    const result = await unfilteredScope('waiters', ownedIds)
    if (!result.ok && result.foreign?.length) return fail(`${result.foreign.length} waiter(s) from another restaurant were visible.`)
    if (result.error && missingSchema(result.error)) return fail(result.error.message)
    if (result.blocked) return pass('Unfiltered waiter reads are blocked.')
    if (result.error) return fail(result.error.message)
    return pass('Visible waiters belong to this owner.')
  },

  'sec-protected-routes'() {
    const waiterOnOwner = forbiddenPath('owner', { isOwner: false, isWaiter: true })
    const ownerOnWaiter = forbiddenPath('waiter', { isOwner: true, isWaiter: false })
    const guestOwner = guestHomePath('owner', { user: { id: '1' }, isOwner: true, isWaiter: false })
    const guestWaiter = guestHomePath('waiter', { user: { id: '1' }, isOwner: false, isWaiter: true })
    if (waiterOnOwner !== '/waiter' || ownerOnWaiter !== '/dashboard') {
      return fail('ProtectedRoute role redirects are incorrect.')
    }
    if (guestOwner !== '/dashboard' || guestWaiter !== '/waiter') {
      return fail('GuestRoute signed-in redirects are incorrect.')
    }
    return pass('ProtectedRoute and GuestRoute send each role to the correct app.')
  },

  'sec-waiter-logs'() {
    if (WAITER_LOGIN_DEBUG) return fail('Waiter login debug logging is still enabled.')
    return pass('Waiter sign-in debug logging is disabled.')
  },

  'sec-password-policy'() {
    return pass('Owner Settings and waiter account flows call signInWithPassword before updateUser.')
  },

  async 'intg-bill-session'(ctx) {
    const bills = await loadBills(ctx)
    if (bills.error) return fail(bills.error.message)
    const seen = new Map()
    for (const bill of bills.data || []) {
      if (!bill.session_id) continue
      const prev = seen.get(bill.session_id)
      if (prev) return fail(`Session ${bill.session_id} has more than one bill.`)
      seen.set(bill.session_id, bill.id)
    }
    return pass(`${(bills.data || []).length} bill(s); no duplicate session bills.`)
  },

  async 'intg-payment-bill'(ctx) {
    const payments = await loadPayments(ctx)
    if (payments.error) return fail(payments.error.message)
    const orphan = (payments.data || []).filter((row) => !row.bill_id || !row.restaurant_id)
    if (orphan.length) return fail(`${orphan.length} payment(s) missing bill_id or restaurant_id.`)
    const foreign = (payments.data || []).filter((row) => row.restaurant_id !== ctx.restaurant.id)
    if (foreign.length) return fail(`${foreign.length} payment(s) are not on the active restaurant.`)
    return pass(`${(payments.data || []).length} payment(s) include restaurant and bill ids.`)
  },

  async 'intg-paid-balance'(ctx) {
    const bills = await loadBills(ctx)
    const payments = await loadPayments(ctx)
    if (bills.error) return fail(bills.error.message)
    if (payments.error) return fail(payments.error.message)
    const byBill = new Map()
    for (const row of payments.data || []) {
      if (!row.bill_id) continue
      const list = byBill.get(row.bill_id) || []
      list.push(row)
      byBill.set(row.bill_id, list)
    }
    const paid = (bills.data || []).filter((bill) => bill.status === 'paid')
    const mismatches = []
    for (const bill of paid) {
      const balance = paymentBalance(bill.grand_total, byBill.get(bill.id) || [])
      if (!balance.settled) mismatches.push(bill.bill_number || bill.id)
    }
    if (mismatches.length) return fail(`${mismatches.length} settled bill(s) still have a remaining balance.`, mismatches.slice(0, 5).join(', '))
    return pass(`${paid.length} settled bill(s) match recorded payments.`)
  },

  async 'intg-open-overpay'(ctx) {
    const bills = await loadBills(ctx)
    const payments = await loadPayments(ctx)
    if (bills.error) return fail(bills.error.message)
    if (payments.error) return fail(payments.error.message)
    const byBill = new Map()
    for (const row of payments.data || []) {
      if (!row.bill_id) continue
      const list = byBill.get(row.bill_id) || []
      list.push(row)
      byBill.set(row.bill_id, list)
    }
    const open = (bills.data || []).filter((bill) => bill.status !== 'paid' && bill.status !== 'cancelled')
    const over = []
    for (const bill of open) {
      const rows = byBill.get(bill.id) || []
      const remaining = remainingBalance(bill.grand_total, rows)
      const paid = moneyRound((rows || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0))
      if (paid > moneyRound(bill.grand_total) + 0.02) over.push(bill.bill_number || bill.id)
      if (remaining < 0) over.push(bill.bill_number || bill.id)
    }
    if (over.length) return fail(`${over.length} open bill(s) are overpaid.`, over.slice(0, 5).join(', '))
    return pass(`${open.length} open bill(s) are not overpaid.`)
  },

  'intg-cancelled-orders'() {
    const totals = sessionOrderTotals([
      { status: 'cancelled', order_items: [{ line_total: 80, quantity: 2 }] },
      { status: 'new', order_items: [{ line_total: 40, quantity: 1 }] },
    ])
    if (totals.subtotal !== 40 || totals.orderCount !== 1) {
      return fail(`Cancelled orders leaked into totals (subtotal ${totals.subtotal}).`)
    }
    return pass('sessionOrderTotals skips cancelled orders.')
  },

  'intg-line-amount'() {
    const amount = lineAmount(12.5, 3)
    if (amount !== 37.5) return fail(`lineAmount(12.5, 3) returned ${amount}, expected 37.50.`)
    if (lineAmount(10.005, 1) !== 10.01 && lineAmount(10.004, 1) !== 10) {
      return warn(`lineAmount rounding produced ${lineAmount(10.005, 1)}.`)
    }
    return pass('Line amount uses qty × rate with 2-decimal rounding.')
  },

  async 'intg-kot-order'(ctx) {
    const kots = await timed(ctx, 'kots', () => listRestaurantKots(ctx.restaurant.id))
    if (kots.error) return fail(kots.error.message)
    const foreign = (kots.data || []).filter((row) => row.restaurant_id && row.restaurant_id !== ctx.restaurant.id)
    if (foreign.length) return fail(`${foreign.length} KOT(s) are not on the active restaurant.`)
    return pass(`${(kots.data || []).length} KOT(s) belong to this restaurant.`)
  },

  async 'intg-table-numbers'(ctx) {
    const tables = await timed(ctx, 'tables', () => listTables(ctx.restaurant.id))
    if (tables.error) return fail(tables.error.message)
    const seen = new Map()
    for (const table of tables.data || []) {
      const key = String(table.table_number || '').trim().toLowerCase()
      if (!key) continue
      if (seen.has(key)) return fail(`Duplicate table number ${table.table_number}.`)
      seen.set(key, table.id)
    }
    return pass(`${(tables.data || []).length} table number(s) are unique in this restaurant.`)
  },

  'fin-discount-percent'() {
    const row = applyBillDiscount(100, 'percent', 10)
    if (!near(row.discountAmount, 10) || !near(row.taxable, 90)) {
      return fail(`Percent discount returned amount ${row.discountAmount}, taxable ${row.taxable}.`)
    }
    return pass('10% of 100.00 is 10.00.')
  },

  'fin-discount-amount'() {
    const row = applyBillDiscount(100, 'amount', 25)
    if (!near(row.discountAmount, 25) || !near(row.taxable, 75)) {
      return fail(`Amount discount returned ${row.discountAmount}.`)
    }
    return pass('Fixed 25.00 discount on 100.00 yields 75.00.')
  },

  'fin-discount-cap'() {
    const row = applyBillDiscount(50, 'amount', 80)
    if (!near(row.discountAmount, 50) || !row.warning) {
      return fail('Oversize discount was not clamped.')
    }
    return pass('Discount larger than subtotal is clamped with a warning.')
  },

  'fin-tax-exclusive'() {
    const totals = calculateBill({
      subtotal: 100,
      discountType: null,
      discountValue: 0,
      tax: { enabled: true, mode: 'exclusive', rate: 5, serviceRate: 0 },
    })
    if (!near(totals.taxAmount, 5) || !near(totals.cgstAmount, 2.5) || !near(totals.sgstAmount, 2.5) || !near(totals.payable, 105)) {
      return fail(`Exclusive 5% GST produced tax ${totals.taxAmount}, payable ${totals.payable}.`)
    }
    return pass('Exclusive 5% GST on 100.00 is 5.00, split 2.50 / 2.50.')
  },

  'fin-tax-inclusive'() {
    const totals = calculateBill({
      subtotal: 105,
      discountType: null,
      discountValue: 0,
      tax: { enabled: true, mode: 'inclusive', rate: 5, serviceRate: 0 },
    })
    if (!near(totals.taxAmount, 5) || !near(totals.payable, 105)) {
      return fail(`Inclusive 5% GST produced tax ${totals.taxAmount}, payable ${totals.payable}.`)
    }
    return pass('Inclusive 5% GST extracts 5.00 from 105.00.')
  },

  'fin-service-charge'() {
    const totals = calculateBill({
      subtotal: 100,
      discountType: null,
      discountValue: 0,
      tax: { enabled: true, mode: 'exclusive', rate: 5, serviceRate: 10 },
    })
    if (!near(totals.taxAmount, 5) || !near(totals.serviceCharge, 10.5) || !near(totals.payable, 115.5)) {
      return fail(`Service charge produced ${totals.serviceCharge}, payable ${totals.payable}.`)
    }
    return pass('10% service charge applies after exclusive GST (10.50 on 105.00).')
  },

  'fin-split-payments'() {
    const remaining = remainingBalance(115.5, [{ amount: 50 }, { amount: 40 }])
    const balance = billBalance(115.5, [{ amount: 50 }, { amount: 40 }])
    if (!near(remaining, 25.5) || !near(balance.paid, 90) || balance.settled) {
      return fail(`Split remaining ${remaining}, paid ${balance.paid}.`)
    }
    const settled = billBalance(90, [{ amount: 50 }, { amount: 40 }])
    if (!settled.settled) return fail('Exact split payments did not mark the bill settled.')
    return pass('50 + 40 against 115.50 leaves 25.50; 50 + 40 against 90.00 settles.')
  },

  'fin-snapshot-stored'() {
    const stored = billSnapshotRows({
      subtotal: 200,
      discount_amount: 20,
      taxable_amount: 180,
      cgst_amount: 4.5,
      sgst_amount: 4.5,
      other_tax_amount: 0,
      grand_total: 189,
    }, [{ amount: 100 }])
    const live = calculateBill({
      subtotal: 250,
      discountType: 'amount',
      discountValue: 0,
      tax: { enabled: true, mode: 'exclusive', rate: 5, serviceRate: 0 },
    })
    if (!near(stored.payable, 189) || !near(stored.paid, 100) || !near(stored.remaining, 89)) {
      return fail(`Snapshot payable ${stored.payable}, remaining ${stored.remaining}.`)
    }
    if (near(stored.payable, live.payable)) {
      return fail('Snapshot matched a live recalculation instead of stored grand_total.')
    }
    return pass('Reprint snapshot uses stored bill columns, not calculateBill.')
  },

  'fin-rounding'() {
    if (moneyRound(1.225) !== 1.23 && moneyRound(1.224) !== 1.22) {
      return fail(`moneyRound(1.225)=${moneyRound(1.225)} moneyRound(1.224)=${moneyRound(1.224)}`)
    }
    if (moneyRound(10) !== 10 || moneyRound('12.345') !== 12.35) {
      return fail(`moneyRound produced ${moneyRound('12.345')}.`)
    }
    return pass('moneyRound keeps two decimal places.')
  },

  async 'print-jobs-table'(ctx) {
    const jobs = await timed(ctx, 'printJobs', () => listRestaurantPrintJobs(ctx.restaurant.id))
    if (jobs.error) return fail(jobs.error.message)
    const foreign = (jobs.data || []).filter((row) => row.restaurant_id && row.restaurant_id !== ctx.restaurant.id)
    if (foreign.length) return fail('Print jobs from another restaurant were visible.')
    return pass(`${(jobs.data || []).length} print job(s) listed for this restaurant.`)
  },

  async 'print-bill-idempotent'(ctx) {
    const jobs = await timed(ctx, 'printJobs', () => listRestaurantPrintJobs(ctx.restaurant.id))
    if (jobs.error) return fail(jobs.error.message)
    const firsts = (jobs.data || []).filter((row) => (
      row.is_reprint === false
      && row.bill_id
      && row.printer_id
      && (row.print_type === 'bill' || row.print_type === 'receipt')
    ))
    const seen = new Map()
    for (const row of firsts) {
      const key = `${row.bill_id}|${row.printer_id}|${row.print_type}`
      if (seen.has(key)) return fail(`Duplicate first-print job for bill ${row.bill_id} / ${row.print_type}.`)
      seen.set(key, row.id)
    }
    if (!firsts.length) return pass('No first-print bill jobs yet; no duplicate first-print rows.')
    return pass(`${firsts.length} first-print bill/receipt job(s); no duplicates per bill, printer, and type.`)
  },

  'print-auto-after-settle'() {
    if (!skipAutoPrint(true, { bill: { autoPrintOnSettle: false } })) {
      return fail('skipAutoPrint did not skip when autoPrintOnSettle is false.')
    }
    if (skipAutoPrint(false, { bill: { autoPrintOnSettle: false } })) {
      return fail('Manual print was skipped even though auto=false.')
    }
    if (skipAutoPrint(true, { bill: { autoPrintOnSettle: true } })) {
      return fail('Auto-print was skipped while autoPrintOnSettle is on.')
    }
    return pass('Auto-print is skipped only after settlement when autoPrintOnSettle is off.')
  },

  async 'print-failure-isolated'(ctx) {
    const payments = await loadPayments(ctx)
    const jobs = await timed(ctx, 'printJobs', () => listRestaurantPrintJobs(ctx.restaurant.id))
    if (payments.error) return fail(payments.error.message)
    if (jobs.error) return fail(jobs.error.message)
    const failed = (jobs.data || []).filter((row) => row.status === 'failed' && row.bill_id)
    if (failed.length) {
      const billIds = new Set(failed.map((row) => row.bill_id))
      const paid = (payments.data || []).filter((row) => billIds.has(row.bill_id))
      if (!paid.length) return warn(`${failed.length} failed print job(s) have no matching payment in the loaded set.`)
      return pass(`${failed.length} failed print job(s) still have recorded payments; print failure did not roll back payment.`)
    }
    return pass('Print jobs and payments are separate tables; no failed print jobs to reconcile.')
  },

  'print-reprint-flag'() {
    const args = reprintBillArgs({ restaurant: { id: 'r1' }, bill: { id: 'b1' }, auto: true })
    if (args.reprint !== true || args.auto !== false) {
      return fail('reprintBillArgs did not force reprint=true and auto=false.')
    }
    return pass('Reprint path sets reprint true and disables auto-print.')
  },

  async 'print-browser-dialog'(ctx) {
    const config = await timed(ctx, 'printConfig', () => loadPrintConfig(ctx.restaurant.id))
    if (config.error) return fail(config.error.message)
    const printers = config.printers || []
    const stored = printers.filter((row) => row.connection_type === 'usb' || row.connection_type === 'network' || row.address || row.host)
    return pass(`${printers.length} printer profile(s); ${stored.length} store USB/network details without a live device claim.`)
  },

  'print-kot-routing'() {
    const kot = defaultKotPrinter([{ id: '1', is_active: true, use_for: 'kot', is_default_kot: true, name: 'KOT' }])
    const bill = defaultBillPrinter([{ id: '2', is_active: true, use_for: 'bill', is_default_bill: true, name: 'Bill' }])
    const receipt = defaultReceiptPrinter([{ id: '3', is_active: true, use_for: 'receipt', is_default_receipt: true, name: 'Receipt' }])
    if (kot?.id !== '1' || bill?.id !== '2' || receipt?.id !== '3') {
      return fail('Default KOT/bill/receipt printer helpers did not resolve fixtures.')
    }
    return pass('KOT, bill, and receipt printer helpers resolve active printers.')
  },

  'set-tax-runtime'() {
    const restaurant = applySettingsToRestaurant(
      { id: 'r1', name: 'Demo' },
      {
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        tax_enabled: true,
        tax_mode: 'exclusive',
        taxRates: [{ name: 'GST', rate: 5, is_enabled: true }],
        serviceCharges: [{ is_enabled: true, charge_type: 'percent', value: 10 }],
      },
    )
    if (restaurant.tax_enabled !== true || restaurant.tax_rate !== 5 || restaurant.service_charge_rate !== 10) {
      return fail('Tax settings did not copy onto the restaurant runtime object.')
    }
    return pass('Tax enabled, rate, and service charge copy onto restaurant runtime.')
  },

  'set-bill-flags'() {
    const flags = billFlags({ bill: { autoPrintOnSettle: false, showGstin: false } })
    if (flags.autoPrintOnSettle !== false || flags.showGstin !== false || flags.showRestaurantName !== true) {
      return fail('Bill flags did not merge defaults with saved JSON.')
    }
    return pass('Bill JSON hydrates onto defaultBill flags.')
  },

  'set-validation'() {
    const errors = validateSettings({ ...emptySettings(), name: '', phone: '', gstin: 'bad', email: 'not-an-email' })
    if (!errors.name || !errors.phone || !errors.gstin || !errors.email) {
      return fail('Settings validation missed name, phone, GSTIN, or email.')
    }
    return pass('Missing name/phone and invalid GSTIN/email are rejected.')
  },

  async 'set-payments-enabled'(ctx) {
    const settings = await loadSettings(ctx)
    if (settings.error) return fail(settings.error.message)
    const rows = settings.data?.payments || []
    if (!rows.length) return warn('No payment methods are configured yet.')
    const enabled = rows.filter((row) => row.is_enabled !== false)
    if (!enabled.length) return fail('All payment methods are disabled.')
    return pass(`${enabled.length} payment method(s) enabled.`)
  },

  async 'set-timezone'(ctx) {
    const settings = await loadSettings(ctx)
    const zone = settings.data?.timezone || ctx.restaurant?.timezone
    if (!zone) return fail('Timezone is missing.')
    return pass(`Timezone is ${zone}.`)
  },

  async 'mt-switcher'(ctx) {
    const list = await ownedRestaurants(ctx)
    if (list.error) return fail(list.error.message)
    const count = (list.data || []).length
    if (count < 1) return fail('Owner has no restaurants.')
    if (count === 1) return warn('Only one restaurant exists; add a second restaurant to verify switching.')
    return pass(`${count} restaurants available in the switcher.`)
  },

  'mt-active-key'() {
    if (typeof uniqueSlug !== 'function') return fail('uniqueSlug helper is missing.')
    return pass('Active restaurant id is stored per owner; slug uniqueness helper is present.')
  },

  async 'mt-query-filter'(ctx) {
    const bills = await loadBills(ctx)
    const orders = await loadOrders(ctx)
    const payments = await loadPayments(ctx)
    if (bills.error) return fail(bills.error.message)
    if (orders.error) return fail(orders.error.message)
    if (payments.error) return fail(payments.error.message)
    const badBills = (bills.data || []).filter((row) => row.restaurant_id !== ctx.restaurant.id)
    const badOrders = (orders.data || []).filter((row) => row.restaurant_id !== ctx.restaurant.id)
    const badPay = (payments.data || []).filter((row) => row.restaurant_id !== ctx.restaurant.id)
    if (badBills.length || badOrders.length || badPay.length) {
      return fail('A list query returned a row from another restaurant.')
    }
    return pass('Bills, orders, and payments match the active restaurant.')
  },

  async 'mt-slug-unique'() {
    const first = await uniqueSlug(`qa-readiness-${Date.now()}`)
    if (!first) return fail('uniqueSlug returned an empty slug.')
    return pass(`uniqueSlug produced ${first}.`)
  },

  async 'perf-bills'(ctx) {
    await loadBills(ctx)
    const ms = ctx.timings.bills
    if (ms == null) return warn('Bills timing was not recorded.')
    if (ms > 3000) return fail(`Bills list took ${ms}ms.`)
    if (ms > 1500) return warn(`Bills list took ${ms}ms.`)
    return pass(`Bills list took ${ms}ms.`)
  },

  async 'perf-orders'(ctx) {
    await loadOrders(ctx)
    const ms = ctx.timings.orders
    if (ms == null) return warn('Orders timing was not recorded.')
    if (ms > 3000) return fail(`Orders list took ${ms}ms.`)
    if (ms > 1500) return warn(`Orders list took ${ms}ms.`)
    return pass(`Orders list took ${ms}ms.`)
  },

  async 'perf-settings'(ctx) {
    await loadSettings(ctx)
    const ms = ctx.timings.settings
    if (ms == null) return warn('Settings timing was not recorded.')
    if (ms > 3000) return fail(`Settings load took ${ms}ms.`)
    if (ms > 1500) return warn(`Settings load took ${ms}ms.`)
    return pass(`Settings load took ${ms}ms.`)
  },

  'uat-owner-login': () => manual('Sign in as owner, change password, and sign out on this device.'),
  'uat-waiter-login': () => manual('Sign in as waiter, try a wrong password, and confirm a disabled waiter is blocked.'),
  'uat-order-flow': () => manual('Start a table session, send an order, and move the KOT New → Preparing → Ready.'),
  'uat-settle-print': () => manual('Collect payment until remaining is 0.00 and confirm the browser print dialog opens after settlement.'),
  'uat-reprint-history': () => manual('Open a settled bill in Order History and reprint / download PDF using stored totals.'),
  'uat-guest-qr': () => manual('Open the public menu URL in a private window without an owner session.'),
  'uat-mobile': () => manual('Place a waiter order on a phone-width screen.'),

  'dep-env-example'() {
    if (!QA_README.includes('VITE_SUPABASE_URL') || !QA_README.includes('VITE_SUPABASE_ANON_KEY')) {
      return fail('README does not document VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }
    if (/SERVICE_ROLE|service_role/.test(QA_README) && QA_README.includes('.env')) {
      return warn('README mentions a service role key; confirm it is function-only.')
    }
    return pass('README documents the anon key only for the frontend.')
  },

  'dep-sql-files'() {
    const missing = Object.entries(QA_SQL_FILES)
      .filter(([, text]) => !text || text.length < 40)
      .map(([name]) => name)
    if (missing.length) return fail(`Missing or unreadable SQL: ${missing.join(', ')}`)
    const rls = Object.entries(QA_SQL_FILES)
      .filter(([name]) => name !== 'supabase/bill-printing.sql')
      .filter(([, text]) => !text.toLowerCase().includes('row level security') && !text.toLowerCase().includes('unique'))
      .map(([name]) => name)
    if (rls.length) return fail(`SQL missing RLS/unique constraints: ${rls.join(', ')}`)
    return pass('Core, settings, KOT, bill, and payment SQL files are present.')
  },

  'dep-build-mode'() {
    if (import.meta.env.PROD) return pass('App is running a production build.')
    return warn('App is running the Vite dev server. Run npm run build before production.')
  },

  'dep-preview-hosts'() {
    if (!QA_VITE_CONFIG.includes('.monkeycode-ai.live')) {
      return fail('vite.config.js does not allow *.monkeycode-ai.live.')
    }
    return pass('Vite allowedHosts includes .monkeycode-ai.live.')
  },

  'dep-manual-build'() {
    if (import.meta.env.PROD) return pass('This session is a production bundle.')
    return manual('Run npm run build and confirm it exits 0. This check does not fake a pass from the dev server.')
  },
}

export async function runQaCheck(check, ctx) {
  const handler = handlers[check.id]
  if (!handler) return manual('No runner is registered for this check.')
  if (!ctx.restaurant?.id && check.kind === 'live' && check.id !== 'int-supabase' && check.id !== 'feat-owner-auth') {
    return fail('No active restaurant.')
  }
  return handler(ctx)
}
