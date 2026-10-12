import { hasSupabaseConfig } from './supabase'
import { menuUrl } from './menuUrl'
import { listCategories } from '../services/categories'
import { listMenuItems } from '../services/menuItems'
import { listTables } from '../services/tables'
import { listOpenSessions } from '../services/tableSessions'
import { loadPrintConfig } from '../services/printJobs'
import { countRestaurantRows } from '../services/support'

function result(id, title, status, message) {
  return { id, title, status, message }
}

function fromQuery(id, title, countResult, passMessage, warnEmpty) {
  if (countResult?.missing) {
    return result(id, title, 'failed', countResult.error || 'This module is not ready in the database.')
  }
  if (countResult?.error) {
    return result(id, title, 'failed', countResult.error)
  }
  if (typeof countResult?.count === 'number') {
    if (countResult.count === 0 && warnEmpty) return result(id, title, 'warning', warnEmpty)
    return result(id, title, 'operational', passMessage(countResult.count))
  }
  return result(id, title, 'not-checked', 'Not checked')
}

export async function runRestaurantHealth({ restaurant, user }) {
  const rows = []

  rows.push(
    hasSupabaseConfig && user?.id
      ? result('access', 'Application access', 'operational', 'Owner session is signed in and the public Supabase client is configured.')
      : result('access', 'Application access', 'failed', 'Owner session or public Supabase configuration is missing.'),
  )

  if (!restaurant?.id) {
    rows.push(result('data', 'Restaurant data access', 'failed', 'No restaurant is selected.'))
    return rows.concat([
      result('menu', 'Menu availability', 'not-checked', 'Select a restaurant first.'),
      result('tables', 'Table/session workflow', 'not-checked', 'Select a restaurant first.'),
      result('orders', 'Order submission', 'not-checked', 'Select a restaurant first.'),
      result('kot', 'KOT/Kitchen', 'not-checked', 'Select a restaurant first.'),
      result('bills', 'Bill/payment workflow', 'not-checked', 'Select a restaurant first.'),
      result('printers', 'Printer configuration', 'not-checked', 'Select a restaurant first.'),
      result('qr', 'QR/Public Menu availability', 'not-checked', 'Select a restaurant first.'),
    ])
  }

  const restaurantId = restaurant.id
  const [settingsCount, categories, items, tables, sessions, orders, kots, bills, printConfig] = await Promise.all([
    countRestaurantRows('restaurant_settings', restaurantId),
    listCategories(restaurantId),
    listMenuItems(restaurantId),
    listTables(restaurantId),
    listOpenSessions(restaurantId),
    countRestaurantRows('orders', restaurantId),
    countRestaurantRows('kots', restaurantId),
    countRestaurantRows('bills', restaurantId),
    loadPrintConfig(restaurantId),
  ])

  if (settingsCount.error && !settingsCount.missing) {
    rows.push(result('data', 'Restaurant data access', 'failed', settingsCount.error))
  } else if (categories.error) {
    rows.push(result('data', 'Restaurant data access', 'failed', categories.error.message || 'Unable to read restaurant data.'))
  } else {
    rows.push(result('data', 'Restaurant data access', 'operational', `${restaurant.name || 'Restaurant'} is readable for this owner.`))
  }

  if (items.error) {
    rows.push(result('menu', 'Menu availability', 'failed', items.error.message || 'Unable to load menu items.'))
  } else {
    const available = (items.data || []).filter((item) => item.is_available !== false).length
    const total = (items.data || []).length
    if (!total) rows.push(result('menu', 'Menu availability', 'warning', 'No menu items are configured.'))
    else if (!available) rows.push(result('menu', 'Menu availability', 'warning', `${total} item${total === 1 ? '' : 's'} found, all marked unavailable.`))
    else rows.push(result('menu', 'Menu availability', 'operational', `${available} of ${total} item${total === 1 ? '' : 's'} available.`))
  }

  if (tables.error) {
    rows.push(result('tables', 'Table/session workflow', 'failed', tables.error.message || 'Unable to load tables.'))
  } else if (sessions.error) {
    rows.push(result('tables', 'Table/session workflow', 'failed', sessions.error.message || 'Unable to load sessions.'))
  } else {
    const tableCount = (tables.data || []).length
    const open = (sessions.data || []).length
    if (!tableCount) rows.push(result('tables', 'Table/session workflow', 'warning', 'No tables are configured.'))
    else rows.push(result('tables', 'Table/session workflow', 'operational', `${tableCount} table${tableCount === 1 ? '' : 's'}, ${open} open session${open === 1 ? '' : 's'}.`))
  }

  rows.push(fromQuery(
    'orders',
    'Order submission',
    orders,
    (count) => `${count} order${count === 1 ? '' : 's'} readable for this restaurant.`,
    'Orders table is reachable, but no orders exist yet.',
  ))

  rows.push(fromQuery(
    'kot',
    'KOT/Kitchen',
    kots,
    (count) => `${count} kitchen ticket${count === 1 ? '' : 's'} readable.`,
    'Kitchen tickets table is reachable, but none exist yet.',
  ))

  rows.push(fromQuery(
    'bills',
    'Bill/payment workflow',
    bills,
    (count) => `${count} bill${count === 1 ? '' : 's'} readable for this restaurant.`,
    'Bills table is reachable, but none exist yet.',
  ))

  if (printConfig.error) {
    rows.push(result('printers', 'Printer configuration', 'failed', printConfig.error.message || 'Unable to load printer profiles.'))
  } else {
    const printers = printConfig.printers || []
    const active = printers.filter((row) => row.is_active !== false).length
    if (!printers.length) {
      rows.push(result('printers', 'Printer configuration', 'warning', 'No printer profiles are configured. Browser print may still be available.'))
    } else {
      rows.push(result('printers', 'Printer configuration', 'operational', `${active} active profile${active === 1 ? '' : 's'} of ${printers.length}. Physical hardware is not verified.`))
    }
  }

  if (!restaurant.slug) {
    rows.push(result('qr', 'QR/Public Menu availability', 'warning', 'This restaurant has no public slug yet.'))
  } else {
    rows.push(result('qr', 'QR/Public Menu availability', 'operational', `Public menu path is ${menuUrl(restaurant.slug)}.`))
  }

  return rows
}

export function healthSummary(rows) {
  const statuses = (rows || []).map((row) => row.status)
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.includes('manual')) return 'manual'
  if (statuses.includes('operational')) return 'operational'
  return 'not-checked'
}
