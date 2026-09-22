import { supabase } from '../lib/supabase'
import { createQrToken, sanitizeTableName, sanitizeTableNumber, tableNumberKey } from '../lib/tableToken'

function duplicateNumberError() {
  return { message: 'This table number already exists for this restaurant.' }
}

function isDuplicateNumberError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('restaurant_tables_restaurant_number_idx') || text.includes('duplicate key')
}

function isMissingColumnError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('table_number') || text.includes('is_active') || text.includes('schema cache') || text.includes('column')
}

export function isTableActive(table) {
  return table?.is_active !== false
}

export async function listTables(restaurantId) {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return { data: data ?? [], error }
}

export async function getPublicTable(restaurantId, qrToken) {
  const token = String(qrToken || '').trim()
  if (!restaurantId || !token) return { data: null, error: null }
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('qr_token', token)
    .maybeSingle()
  if (error) return { data: null, error }
  if (!data || data.is_active === false) return { data: null, error: null }
  return { data, error: null }
}

export function hasDuplicateTableNumber(tables, tableNumber, excludeId) {
  const key = tableNumberKey(tableNumber)
  if (!key) return false
  return (tables || []).some((item) => item.id !== excludeId && tableNumberKey(item.table_number || item.name) === key)
}

export async function createTable(restaurantId, values, sortOrder) {
  const tableNumber = sanitizeTableNumber(values.table_number)
  if (!tableNumber) return { data: null, error: { message: 'Table number required' } }
  const name = sanitizeTableName(values.name)
  const displayName = name || tableNumber
  const payload = {
    restaurant_id: restaurantId,
    table_number: tableNumber,
    name: displayName,
    qr_token: createQrToken(),
    is_active: values.is_active !== false,
    sort_order: sortOrder ?? 0,
  }
  let { data, error } = await supabase.from('restaurant_tables').insert(payload).select().single()
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from('restaurant_tables')
      .insert({
        restaurant_id: restaurantId,
        name: displayName,
        qr_token: payload.qr_token,
        sort_order: payload.sort_order,
      })
      .select()
      .single()
    data = fallback.data
    error = fallback.error
  }
  if (error && isDuplicateNumberError(error)) return { data: null, error: duplicateNumberError() }
  return { data, error }
}

export async function updateTable(id, restaurantId, values) {
  const payload = {}
  if (values.table_number != null) {
    const tableNumber = sanitizeTableNumber(values.table_number)
    if (!tableNumber) return { data: null, error: { message: 'Table number required' } }
    payload.table_number = tableNumber
    if (values.name == null) payload.name = tableNumber
  }
  if (values.name != null) {
    const name = sanitizeTableName(values.name)
    payload.name = name || payload.table_number || name
  }
  if (values.sort_order != null) payload.sort_order = values.sort_order
  if (values.is_active != null) payload.is_active = Boolean(values.is_active)
  let { data, error } = await supabase
    .from('restaurant_tables')
    .update(payload)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()
  if (error && isMissingColumnError(error)) {
    const fallback = {}
    if (payload.name != null || payload.table_number != null) fallback.name = payload.name || payload.table_number
    if (payload.sort_order != null) fallback.sort_order = payload.sort_order
    const next = await supabase
      .from('restaurant_tables')
      .update(fallback)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()
    data = next.data
    error = next.error
  }
  if (error && isDuplicateNumberError(error)) return { data: null, error: duplicateNumberError() }
  return { data, error }
}

export async function deleteTable(id, restaurantId) {
  const { error } = await supabase
    .from('restaurant_tables')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
  return { error }
}

export async function reorderTables(restaurantId, tables) {
  const results = await Promise.all(
    tables.map((table, index) =>
      supabase
        .from('restaurant_tables')
        .update({ sort_order: index })
        .eq('id', table.id)
        .eq('restaurant_id', restaurantId),
    ),
  )
  return { error: results.find((result) => result.error)?.error || null }
}
