import { supabase } from '../lib/supabase'
import { OPEN_SESSION_STATUSES, isOpenSession } from '../lib/orderCart'

const SESSION_SELECT = 'id, restaurant_id, session_number, primary_table_id, status, started_at, closed_at, created_at'

function friendlySessionError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('already has an open session')) return { message: 'This table already has an open session.' }
  if (text.includes('does not belong')) return { message: 'That table does not belong to this restaurant.' }
  if (text.includes('table_sessions') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Table sessions are not ready. Run supabase/table-wise-order-fixed.sql in the SQL Editor.' }
  }
  return error
}

export function sessionForTable(sessions, tableId) {
  if (!tableId) return null
  return (sessions || []).find((session) => {
    if (!isOpenSession(session)) return false
    if (session.primary_table_id === tableId) return true
    const linked = session.session_tables
    return Array.isArray(linked) && linked.some((row) => row.table_id === tableId)
  }) || null
}

export function waiterOwnsSession(tables, session) {
  if (!session) return false
  const ids = new Set((tables || []).map((item) => item.id))
  if (session.primary_table_id && ids.has(session.primary_table_id)) return true
  return Array.isArray(session.session_tables) && session.session_tables.some((row) => ids.has(row.table_id))
}

export function tableForSession(tables, session) {
  if (!session) return null
  const list = tables || []
  const primary = list.find((item) => item.id === session.primary_table_id)
  if (primary) return primary
  const linked = session.session_tables
  if (!Array.isArray(linked)) return null
  return list.find((item) => linked.some((row) => row.table_id === item.id)) || null
}

export async function listOpenSessions(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  let { data, error } = await supabase
    .from('table_sessions')
    .select(`${SESSION_SELECT}, session_tables(table_id)`)
    .eq('restaurant_id', restaurantId)
    .in('status', OPEN_SESSION_STATUSES)
    .order('started_at', { ascending: true })
  if (error && String(error.message || '').toLowerCase().includes('session_tables')) {
    const fallback = await supabase
      .from('table_sessions')
      .select(SESSION_SELECT)
      .eq('restaurant_id', restaurantId)
      .in('status', OPEN_SESSION_STATUSES)
      .order('started_at', { ascending: true })
    data = fallback.data
    error = fallback.error
  }
  return { data: data ?? [], error: friendlySessionError(error) }
}

export async function getSession(sessionId, restaurantId) {
  if (!sessionId || !restaurantId) return { data: null, error: null }
  let { data, error } = await supabase
    .from('table_sessions')
    .select(`${SESSION_SELECT}, session_tables(table_id)`)
    .eq('id', sessionId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (error && String(error.message || '').toLowerCase().includes('session_tables')) {
    const fallback = await supabase
      .from('table_sessions')
      .select(SESSION_SELECT)
      .eq('id', sessionId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    data = fallback.data
    error = fallback.error
  }
  return { data, error: friendlySessionError(error) }
}

async function nextSessionNumber(restaurantId) {
  const { data, error } = await supabase.rpc('next_session_number', { p_restaurant_id: restaurantId })
  if (error || !data) {
    const { data: rows } = await supabase
      .from('table_sessions')
      .select('session_number')
      .eq('restaurant_id', restaurantId)
    const max = (rows || []).reduce((n, row) => {
      const value = Number(String(row.session_number || '').replace(/\D/g, '')) || 0
      return value > n ? value : n
    }, 0)
    return { number: `S${String(max + 1).padStart(3, '0')}`, error: error && !rows ? error : null }
  }
  return { number: data, error: null }
}

export async function openTableSession(restaurantId, table) {
  if (!restaurantId) return { data: null, error: { message: 'Restaurant required' } }
  if (!table?.id || table.restaurant_id !== restaurantId) {
    return { data: null, error: { message: 'This table is not assigned to you.' } }
  }

  const existing = await listOpenSessions(restaurantId)
  if (existing.error) return { data: null, error: existing.error }
  const current = sessionForTable(existing.data, table.id)
  if (current) return { data: current, error: null }

  const { number, error: numberError } = await nextSessionNumber(restaurantId)
  if (numberError) return { data: null, error: friendlySessionError(numberError) }

  const { data, error } = await supabase
    .from('table_sessions')
    .insert({
      restaurant_id: restaurantId,
      session_number: number,
      primary_table_id: table.id,
      status: 'active',
    })
    .select(SESSION_SELECT)
    .single()
  return { data, error: friendlySessionError(error) }
}
