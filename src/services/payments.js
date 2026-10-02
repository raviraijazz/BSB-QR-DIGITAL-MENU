import { supabase } from '../lib/supabase'
import { moneyRound, paymentsTotal, remainingBalance } from '../lib/orderCart'

const PAYMENT_SELECT =
  'id, restaurant_id, session_id, bill_id, payment_method, amount, payment_reference, paid_at, created_at, client_request_id'

function friendlyPaymentError(error, kind = 'load') {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('collect_bill_payment') && (text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find'))) {
    return { message: 'Payments are not ready. Run supabase/bill-payments.sql in the SQL Editor.' }
  }
  if (text.includes('payments') && (text.includes('does not exist') || text.includes('schema cache'))) {
    return { message: 'Payments are not ready. Run supabase/table-wise-order-fixed.sql, then supabase/bill-payments.sql.' }
  }
  if (text.includes('cannot exceed remaining')) return { message: 'Payment cannot exceed remaining balance.' }
  if (text.includes('already settled')) return { message: 'This bill is already settled.' }
  if (text.includes('no longer open') || text.includes('no longer active')) {
    return { message: 'This table session is no longer active.' }
  }
  if (text.includes('choose cash') || text.includes('payment method')) {
    return { message: 'Choose Cash, UPI or Card.' }
  }
  if (text.includes('enter a payment amount')) return { message: 'Enter a payment amount.' }
  if (text.includes('running bill not found')) return { message: 'Running bill not found.' }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: kind === 'collect' ? 'Only the restaurant owner can collect payment.' : 'Unable to load payments. Please try again.' }
  }
  if (kind === 'collect') return { message: 'Unable to record payment. Please try again.' }
  return { message: 'Unable to load payments. Please try again.' }
}

export function paymentBalance(payable, payments) {
  const paid = paymentsTotal(payments)
  const remaining = remainingBalance(payable, payments)
  return { paid, remaining, settled: remaining === 0 && moneyRound(payable) >= 0 }
}

export async function listRestaurantPayments(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('restaurant_id', restaurantId)
    .order('paid_at', { ascending: false })
  if (error) {
    const fallback = await supabase
      .from('payments')
      .select('id, restaurant_id, session_id, bill_id, payment_method, amount, payment_reference, paid_at, created_at')
      .eq('restaurant_id', restaurantId)
      .order('paid_at', { ascending: false })
    if (fallback.error) return { data: [], error: friendlyPaymentError(error) }
    return { data: fallback.data ?? [], error: null }
  }
  return { data: data ?? [], error: null }
}

export async function listBillPayments(restaurantId, billId) {
  if (!restaurantId || !billId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('restaurant_id', restaurantId)
    .eq('bill_id', billId)
    .order('paid_at', { ascending: true })
  if (error) {
    const fallback = await supabase
      .from('payments')
      .select('id, restaurant_id, session_id, bill_id, payment_method, amount, payment_reference, paid_at, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('bill_id', billId)
      .order('paid_at', { ascending: true })
    if (fallback.error) return { data: [], error: friendlyPaymentError(error) }
    return { data: fallback.data ?? [], error: null }
  }
  return { data: data ?? [], error: null }
}

export async function listSessionPayments(restaurantId, sessionId) {
  if (!restaurantId || !sessionId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('payments')
    .select('id, restaurant_id, session_id, bill_id, payment_method, amount, payment_reference, paid_at, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('session_id', sessionId)
    .order('paid_at', { ascending: true })
  if (error) return { data: [], error: friendlyPaymentError(error) }
  return { data: data ?? [], error: null }
}

export async function collectBillPayment({ restaurantId, billId, amount, method, reference, requestId }) {
  if (!restaurantId || !billId) return { data: null, error: { message: 'Running bill not found.' } }
  const rpc = await supabase.rpc('collect_bill_payment', {
    p_restaurant_id: restaurantId,
    p_bill_id: billId,
    p_amount: moneyRound(amount),
    p_method: method,
    p_reference: String(reference || '').trim(),
    p_request_id: requestId || null,
  })
  if (rpc.error) return { data: null, error: friendlyPaymentError(rpc.error, 'collect') }
  return { data: rpc.data, error: null }
}
