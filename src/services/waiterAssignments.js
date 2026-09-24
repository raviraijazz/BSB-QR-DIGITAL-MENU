import { supabase } from '../lib/supabase'

const ASSIGNMENT_SELECT = 'id, restaurant_id, waiter_id, table_id, created_at'

function friendlyAssignmentError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('waiter_table_assignments') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Assignment table is not ready. Run supabase/table-wise-order-fixed.sql in the SQL Editor.' }
  }
  if (text.includes('waiter does not belong') || text.includes('table does not belong')) {
    return { message: 'That waiter and table must belong to the same restaurant.' }
  }
  if (text.includes('duplicate key') || text.includes('waiter_table_assignments_table')) {
    return { message: 'This table is already assigned to a waiter. Reassign it explicitly.' }
  }
  return error
}

export function assignmentsByTableId(assignments) {
  const map = new Map()
  for (const row of assignments || []) {
    if (row?.table_id) map.set(row.table_id, row)
  }
  return map
}

export function assignedCountForWaiter(assignments, waiterUuid) {
  if (!waiterUuid) return 0
  return (assignments || []).filter((row) => row.waiter_id === waiterUuid).length
}

export async function listAssignments(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('waiter_table_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })
  return { data: data ?? [], error: friendlyAssignmentError(error) }
}

export async function listAssignmentsForWaiter(restaurantId, waiterUuid) {
  if (!restaurantId || !waiterUuid) return { data: [], error: null }
  const { data, error } = await supabase
    .from('waiter_table_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('restaurant_id', restaurantId)
    .eq('waiter_id', waiterUuid)
    .order('created_at', { ascending: true })
  return { data: data ?? [], error: friendlyAssignmentError(error) }
}

export async function saveWaiterTableAssignments(restaurantId, waiter, selectedTableIds, tables) {
  if (!restaurantId) return { error: { message: 'Restaurant required' } }
  if (!waiter?.id) return { error: { message: 'Waiter required' } }
  if (waiter.restaurant_id && waiter.restaurant_id !== restaurantId) {
    return { error: { message: 'This waiter does not belong to the selected restaurant.' } }
  }

  const allowedTableIds = new Set((tables || []).filter((table) => table.restaurant_id === restaurantId).map((table) => table.id))
  const wanted = [...new Set((selectedTableIds || []).filter((id) => allowedTableIds.has(id)))]

  const { data: current, error: loadError } = await listAssignments(restaurantId)
  if (loadError) return { error: loadError }

  const mine = new Set(current.filter((row) => row.waiter_id === waiter.id).map((row) => row.table_id))
  const ownerByTable = assignmentsByTableId(current)
  const adding = wanted.filter((id) => !mine.has(id))

  if (waiter.is_active === false && adding.length) {
    return { error: { message: 'Disabled waiters cannot receive new table assignments.' } }
  }

  const toInsert = []
  const toDeleteIds = []

  for (const tableId of wanted) {
    const existing = ownerByTable.get(tableId)
    if (!existing) {
      toInsert.push(tableId)
      continue
    }
    if (existing.waiter_id === waiter.id) continue
    toDeleteIds.push(existing.id)
    toInsert.push(tableId)
  }

  for (const row of current) {
    if (row.waiter_id === waiter.id && !wanted.includes(row.table_id)) {
      toDeleteIds.push(row.id)
    }
  }

  if (toDeleteIds.length) {
    const { error: deleteError } = await supabase
      .from('waiter_table_assignments')
      .delete()
      .eq('restaurant_id', restaurantId)
      .in('id', toDeleteIds)
    if (deleteError) return { error: friendlyAssignmentError(deleteError) }
  }

  if (toInsert.length) {
    const rows = toInsert.map((tableId) => ({
      restaurant_id: restaurantId,
      waiter_id: waiter.id,
      table_id: tableId,
    }))
    const { error: insertError } = await supabase.from('waiter_table_assignments').insert(rows)
    if (insertError) return { error: friendlyAssignmentError(insertError) }
  }

  return { error: null, assigned: wanted.length }
}
