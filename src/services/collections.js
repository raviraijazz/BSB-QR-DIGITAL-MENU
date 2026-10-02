import { supabase } from '../lib/supabase'
import { buildReportFromData } from '../lib/collectionsReport'
import { listRestaurantBills } from './bills'
import { listRestaurantPayments } from './payments'
import { listTables } from './tables'
import { listWaiters } from './waiters'

export { REPORT_METHODS, billMethodsSummary, buildReportFromData, sessionTableRowLabel } from '../lib/collectionsReport'

function friendlyReportError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('get_collections_report') && (text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find'))) {
    return { message: 'Collections report is running in fallback mode. Run supabase/collections-report.sql in the SQL Editor for faster summaries.' }
  }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: 'Only the restaurant owner can view collection reports.' }
  }
  return { message: 'Unable to load the collection report. Please try again.' }
}

async function loadFallbackData(restaurantId) {
  const [billsRes, paymentsRes, tablesRes, waitersRes, sessionsRes, ordersRes] = await Promise.all([
    listRestaurantBills(restaurantId),
    listRestaurantPayments(restaurantId),
    listTables(restaurantId),
    listWaiters(restaurantId),
    supabase
      .from('table_sessions')
      .select('id, session_number, primary_table_id, status, started_at, session_tables(table_id)')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('orders')
      .select('id, session_id, waiter_id, status, created_at')
      .eq('restaurant_id', restaurantId),
  ])

  const error = billsRes.error || paymentsRes.error || tablesRes.error || waitersRes.error || sessionsRes.error || ordersRes.error
  return {
    data: {
      bills: billsRes.data || [],
      payments: paymentsRes.data || [],
      tables: tablesRes.data || [],
      waiters: waitersRes.data || [],
      sessions: sessionsRes.data || [],
      orders: ordersRes.data || [],
    },
    error: error || null,
  }
}

export async function getCollectionsReport(params) {
  const {
    restaurantId,
    fromISO,
    toISO,
    tzOffsetMinutes = 0,
    status = 'all',
    method = null,
    waiterId = null,
    tableId = null,
    search = '',
    limit = 200,
    offset = 0,
  } = params
  if (!restaurantId) return { data: null, error: null }

  const rpc = await supabase.rpc('get_collections_report', {
    p_restaurant_id: restaurantId,
    p_from: fromISO,
    p_to: toISO,
    p_tz_offset_minutes: tzOffsetMinutes,
    p_status: status,
    p_method: method,
    p_waiter_id: waiterId,
    p_table_id: tableId,
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  })

  if (!rpc.error && rpc.data) {
    return { data: { ...rpc.data, source: 'rpc' }, error: null }
  }

  const denied = String(rpc.error?.message || '').toLowerCase()
  if (denied.includes('not allowed') || denied.includes('row-level security')) {
    return { data: null, error: friendlyReportError(rpc.error) }
  }

  const fallback = await loadFallbackData(restaurantId)
  if (fallback.error && !(fallback.data.bills.length || fallback.data.payments.length)) {
    return { data: null, error: friendlyReportError(rpc.error || fallback.error) }
  }
  const data = buildReportFromData(fallback.data, {
    from: fromISO,
    to: toISO,
    tzOffsetMinutes,
    status,
    method,
    waiterId,
    tableId,
    search,
    limit,
    offset,
  })
  return { data, error: null }
}
