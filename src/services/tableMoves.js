import { supabase } from '../lib/supabase'
import { applyBillDiscount, sessionOrderTotals } from '../lib/orderCart'
import { sessionForTable } from './tableSessions'

function friendlyMoveError(error, kind = 'merge') {
  if (!error) return error
  const text = String(error.message || '')
  const lower = text.toLowerCase()
  if (lower.includes('merge_table_sessions') || lower.includes('transfer_table_session') || lower.includes('list_session_table_labels')) {
    if (lower.includes('does not exist') || lower.includes('schema cache') || lower.includes('could not find')) {
      return { message: 'Table merge and transfer are not ready. Run supabase/table-merge-transfer.sql in the SQL Editor.' }
    }
  }
  if (lower.includes('only the restaurant owner')) return { message: 'Only the restaurant owner can merge or transfer tables.' }
  if (lower.includes('must belong')) return { message: 'Tables must belong to this restaurant.' }
  if (lower.includes('at least two')) return { message: 'Select at least two tables to merge.' }
  if (lower.includes('primary table')) return { message: 'Choose a primary table.' }
  if (lower.includes('start a session')) return { message: 'Start a session on the primary table first.' }
  if (lower.includes('settled bill') && kind === 'transfer') return { message: 'Cannot transfer a settled bill.' }
  if (lower.includes('settled bill')) return { message: 'Cannot merge a settled bill.' }
  if (lower.includes('partial payment')) return { message: 'This bill has a partial payment. Confirm to continue.' }
  if (lower.includes('separate sessions') || lower.includes('confirm to combine')) {
    return { message: 'These tables have separate sessions. Confirm to combine them into one session and one bill.' }
  }
  if (lower.includes('payments exceed')) return { message: 'Payments exceed the combined payable. Adjust discounts before merging.' }
  if (lower.includes('destination table is occupied')) return { message: 'Destination table is occupied.' }
  if (lower.includes('no active session')) return { message: 'No active session on the current table.' }
  if (lower.includes('different available')) return { message: 'Choose a different available table.' }
  if (lower.includes('already has an open session')) {
    return { message: kind === 'transfer' ? 'Destination table is occupied.' : 'A selected table already has another open session.' }
  }
  if (lower.includes('not allowed') || lower.includes('row-level security')) {
    return { message: 'Only the restaurant owner can merge or transfer tables.' }
  }
  if (kind === 'transfer') return { message: 'Unable to transfer this table. Please try again.' }
  if (kind === 'preview') return { message: 'Unable to preview this merge. Please try again.' }
  return { message: 'Unable to merge these tables. Please try again.' }
}

export function tablesForSession(tables, session) {
  if (!session) return []
  if (Array.isArray(session.labeled_tables) && session.labeled_tables.length) {
    const extras = tables || []
    return session.labeled_tables.map((table) => extras.find((item) => item.id === table.id) || table)
  }
  const list = tables || []
  const ids = new Set()
  const rows = []
  function add(id) {
    if (!id || ids.has(id)) return
    const table = list.find((item) => item.id === id)
    if (!table) return
    ids.add(id)
    rows.push(table)
  }
  add(session.primary_table_id)
  for (const row of session.session_tables || []) add(row.table_id)
  return rows
}

export function sessionTableIds(session) {
  const ids = new Set()
  if (session?.primary_table_id) ids.add(session.primary_table_id)
  for (const row of session?.session_tables || []) {
    if (row?.table_id) ids.add(row.table_id)
  }
  return [...ids]
}

export function occupancyForTable(sessions, tableId) {
  return sessionForTable(sessions, tableId)
}

export function previewMerge({ tables, sessions, orders, bills, payments, primaryTableId, extraIds }) {
  const selectedIds = [...new Set([primaryTableId, ...(extraIds || [])].filter(Boolean))]
  const selectedTables = (tables || []).filter((table) => selectedIds.includes(table.id))
  const involved = []
  const seen = new Set()
  for (const table of selectedTables) {
    const session = sessionForTable(sessions, table.id)
    if (!session || seen.has(session.id)) continue
    seen.add(session.id)
    const sessionOrders = (orders || []).filter((order) => order.session_id === session.id && order.status !== 'cancelled')
    const bill = (bills || []).find((row) => row.session_id === session.id && row.status !== 'cancelled') || null
    const billPayments = bill ? (payments || []).filter((row) => row.bill_id === bill.id) : []
    const totals = sessionOrderTotals(sessionOrders)
    const discount = applyBillDiscount(totals.subtotal, bill?.discount_type, bill?.discount_value)
    const paid = billPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    involved.push({
      session,
      tables: tablesForSession(tables, session),
      orders: sessionOrders,
      bill,
      payments: billPayments,
      subtotal: totals.subtotal,
      orderCount: totals.orderCount,
      itemCount: totals.itemCount,
      discountAmount: discount.discountAmount,
      payable: discount.payable,
      paid,
      remaining: Math.max(0, discount.payable - paid),
      settled: bill?.status === 'paid',
      partial: Boolean(bill && bill.status !== 'paid' && (paid > 0 || bill.status === 'payment_pending')),
    })
  }
  const keep =
    involved.find((row) => sessionTableIds(row.session).includes(primaryTableId) || row.session.primary_table_id === primaryTableId) ||
    involved[0] ||
    null
  const combinedOrders = involved.flatMap((row) => row.orders)
  const totals = sessionOrderTotals(combinedOrders)
  const keepDiscount = applyBillDiscount(totals.subtotal, keep?.bill?.discount_type, keep?.bill?.discount_value)
  const paid = involved.reduce((sum, row) => sum + row.paid, 0)
  const freeTables = selectedTables.filter((table) => !sessionForTable(sessions, table.id))
  return {
    selectedIds,
    selectedTables,
    involved,
    keep,
    freeTables,
    multi: involved.length > 1,
    none: involved.length === 0,
    settled: involved.some((row) => row.settled),
    partial: involved.some((row) => row.partial),
    orderCount: totals.orderCount,
    itemCount: totals.itemCount,
    subtotal: totals.subtotal,
    discountAmount: keepDiscount.discountAmount,
    payable: keepDiscount.payable,
    paid,
    remaining: Math.max(0, keepDiscount.payable - paid),
  }
}

export async function listSessionTableLabels(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase.rpc('list_session_table_labels', {
    p_restaurant_id: restaurantId,
  })
  if (error) return { data: [], error: friendlyMoveError(error, 'preview') }
  return { data: Array.isArray(data) ? data : [], error: null }
}

export async function mergeTableSessions({
  restaurantId,
  primaryTableId,
  tableIds,
  confirmMulti = false,
  confirmPartial = false,
}) {
  if (!restaurantId || !primaryTableId) return { data: null, error: { message: 'Choose a primary table.' } }
  const { data, error } = await supabase.rpc('merge_table_sessions', {
    p_restaurant_id: restaurantId,
    p_primary_table_id: primaryTableId,
    p_table_ids: tableIds,
    p_confirm_multi: confirmMulti,
    p_confirm_partial: confirmPartial,
  })
  if (error) return { data: null, error: friendlyMoveError(error, 'merge') }
  return { data, error: null }
}

export async function transferTableSession({ restaurantId, fromTableId, toTableId, confirmPartial = false }) {
  if (!restaurantId || !fromTableId || !toTableId) {
    return { data: null, error: { message: 'Choose a current table and a destination table.' } }
  }
  const { data, error } = await supabase.rpc('transfer_table_session', {
    p_restaurant_id: restaurantId,
    p_from_table_id: fromTableId,
    p_to_table_id: toTableId,
    p_confirm_partial: confirmPartial,
  })
  if (error) return { data: null, error: friendlyMoveError(error, 'transfer') }
  return { data, error: null }
}
