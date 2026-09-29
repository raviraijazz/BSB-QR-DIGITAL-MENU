import { supabase } from '../lib/supabase'
import { applyBillDiscount, firstRelated, isOpenSession, sessionOrderTotals } from '../lib/orderCart'

const BILL_SELECT =
  'id, restaurant_id, session_id, bill_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, cgst_amount, sgst_amount, other_tax_amount, grand_total, status, created_at, updated_at'

function friendlyBillError(error, kind = 'load') {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('bills') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Running bills are not ready. Run supabase/table-wise-order-fixed.sql in the SQL Editor.' }
  }
  if (text.includes('duplicate') && (text.includes('session') || text.includes('bill_number'))) {
    return { message: 'This session already has a running bill.' }
  }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: kind === 'save' ? 'Only the restaurant owner can change discounts.' : 'Unable to load running bills. Please try again.' }
  }
  if (kind === 'save') return { message: 'Unable to save discount. Please try again.' }
  if (kind === 'create') return { message: 'Unable to open this running bill. Please try again.' }
  return { message: 'Unable to load running bills. Please try again.' }
}

export function waiterLabel(waiter) {
  if (waiter?.full_name && waiter?.waiter_id) return `${waiter.full_name} · ${waiter.waiter_id}`
  return waiter?.waiter_id || waiter?.full_name || 'Waiter'
}

export function orderWaiter(order) {
  return firstRelated(order?.waiters)
}

export function sessionWaiterFromOrders(orders, waitersById) {
  const rows = (orders || [])
    .filter((order) => order.status !== 'cancelled')
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const latest = rows[0]
  if (!latest) return null
  const related = orderWaiter(latest)
  if (related) return related
  if (latest.waiter_id && waitersById?.[latest.waiter_id]) return waitersById[latest.waiter_id]
  return null
}

export function billSnapshot(subtotal, discountType, discountValue) {
  const next = applyBillDiscount(subtotal, discountType, discountValue)
  return {
    subtotal,
    discount_type: next.discountType,
    discount_value: next.discountValue,
    discount_amount: next.discountAmount,
    taxable_amount: next.taxable,
    cgst_amount: 0,
    sgst_amount: 0,
    other_tax_amount: 0,
    grand_total: next.payable,
  }
}

export function runningBillView(session, orders, bill, table, waiter) {
  const totals = sessionOrderTotals(orders)
  const discount = applyBillDiscount(totals.subtotal, bill?.discount_type, bill?.discount_value)
  return {
    session,
    orders: (orders || [])
      .filter((order) => order.status !== 'cancelled')
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    bill,
    table,
    waiter,
    subtotal: totals.subtotal,
    itemCount: totals.itemCount,
    orderCount: totals.orderCount,
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    discountAmount: discount.discountAmount,
    payable: discount.payable,
    status: bill?.status || 'open',
  }
}

function nextBillNumber(existing) {
  let max = 0
  for (const bill of existing || []) {
    const digits = String(bill.bill_number || '').replace(/\D/g, '')
    const n = Number(digits)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `B${String(max + 1).padStart(3, '0')}`
}

export async function listRestaurantBills(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_SELECT)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })
  if (error) return { data: [], error: friendlyBillError(error) }
  return { data: data ?? [], error: null }
}

export async function getSessionBill(restaurantId, sessionId) {
  if (!restaurantId || !sessionId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_SELECT)
    .eq('restaurant_id', restaurantId)
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) return { data: null, error: friendlyBillError(error) }
  return { data: data || null, error: null }
}

export async function ensureSessionBill(restaurantId, session, orders, existingBills = []) {
  if (!restaurantId || !session?.id) return { data: null, error: { message: 'Session not found.' } }
  if (!isOpenSession(session)) return { data: null, error: { message: 'This table session is no longer active.' } }

  const current = (existingBills || []).find((bill) => bill.session_id === session.id)
  const totals = sessionOrderTotals(orders)
  const snapshot = billSnapshot(totals.subtotal, current?.discount_type, current?.discount_value)

  if (current) {
    const same =
      Number(current.subtotal) === snapshot.subtotal &&
      Number(current.discount_amount) === snapshot.discount_amount &&
      Number(current.grand_total) === snapshot.grand_total &&
      (current.discount_type || null) === snapshot.discount_type
    if (same) return { data: current, error: null }
    const { data, error } = await supabase
      .from('bills')
      .update(snapshot)
      .eq('id', current.id)
      .eq('restaurant_id', restaurantId)
      .eq('session_id', session.id)
      .select(BILL_SELECT)
      .maybeSingle()
    if (error) return { data: current, error: friendlyBillError(error, 'save') }
    return { data: data || current, error: null }
  }

  const payload = {
    restaurant_id: restaurantId,
    session_id: session.id,
    bill_number: nextBillNumber(existingBills),
    status: 'open',
    ...snapshot,
  }
  const { data, error } = await supabase.from('bills').insert(payload).select(BILL_SELECT).maybeSingle()
  if (error) {
    const raced = await getSessionBill(restaurantId, session.id)
    if (raced.data) return ensureSessionBill(restaurantId, session, orders, [raced.data, ...existingBills])
    const text = String(error.message || '').toLowerCase()
    if (text.includes('bill_number') || text.includes('duplicate')) {
      const latest = await listRestaurantBills(restaurantId)
      const retryPayload = { ...payload, bill_number: nextBillNumber(latest.data || existingBills) }
      const retry = await supabase.from('bills').insert(retryPayload).select(BILL_SELECT).maybeSingle()
      if (!retry.error && retry.data) return { data: retry.data, error: null }
    }
    return { data: null, error: friendlyBillError(error, 'create') }
  }
  return { data, error: null }
}

export async function saveBillDiscount(restaurantId, bill, subtotal, discountType, discountValue) {
  if (!restaurantId || !bill?.id) return { data: null, error: { message: 'Running bill not found.' } }
  if (bill.status && bill.status !== 'open') {
    return { data: null, error: { message: 'This bill is no longer open.' } }
  }
  const snapshot = billSnapshot(subtotal, discountType, discountValue)
  const { data, error } = await supabase
    .from('bills')
    .update(snapshot)
    .eq('id', bill.id)
    .eq('restaurant_id', restaurantId)
    .eq('session_id', bill.session_id)
    .select(BILL_SELECT)
    .maybeSingle()
  if (error) return { data: null, error: friendlyBillError(error, 'save') }
  if (!data) return { data: null, error: { message: 'Unable to save discount. Please try again.' } }
  return { data, error: null }
}
