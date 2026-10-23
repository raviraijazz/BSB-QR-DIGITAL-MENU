export const INVOICE_STATUSES = [
  { id: 'pending', label: 'Pending' },
  { id: 'partial', label: 'Partially Paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'card', label: 'Card' },
  { id: 'other', label: 'Other' },
]

export const INVOICE_STATUS_META = {
  pending: { label: 'Pending', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  partial: { label: 'Partially Paid', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  overdue: { label: 'Overdue', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
}

export function moneyAmount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

export function invoiceStatusLabel(status) {
  const row = INVOICE_STATUSES.find((item) => item.id === status)
  return row ? row.label : '—'
}

export function paymentMethodLabel(method) {
  const row = PAYMENT_METHODS.find((item) => item.id === method)
  return row ? row.label : method || '—'
}

export function formatInvoiceNumber(year, seq) {
  const y = Number(year)
  const n = Number(seq)
  if (!Number.isInteger(y) || y < 2000 || !Number.isInteger(n) || n < 1) return ''
  return `BSB-SUB-${y}-${String(n).padStart(6, '0')}`
}

export function formatReceiptNumber(year, seq) {
  const y = Number(year)
  const n = Number(seq)
  if (!Number.isInteger(y) || y < 2000 || !Number.isInteger(n) || n < 1) return ''
  return `BSB-RCP-${y}-${String(n).padStart(6, '0')}`
}

export function outstandingBalance(amount, paid) {
  const total = moneyAmount(amount)
  const received = moneyAmount(paid)
  if (total == null || received == null) return null
  return moneyAmount(Math.max(0, total - received))
}

export function deriveInvoiceStatus({ amount, paidAmount, dueDate, cancelled, today }) {
  if (cancelled) return 'cancelled'
  const total = moneyAmount(amount)
  const paid = moneyAmount(paidAmount) || 0
  if (total == null) return 'pending'
  if (total === 0 || paid >= total) return 'paid'
  const due = dueDate instanceof Date ? dueDate : dueDate ? new Date(dueDate) : null
  const now = today instanceof Date ? today : today ? new Date(today) : new Date()
  const duePassed = due && !Number.isNaN(due.getTime()) && due.getTime() < now.getTime()
  if (paid > 0 && paid < total) return duePassed ? 'overdue' : 'partial'
  if (duePassed) return 'overdue'
  return 'pending'
}

export function validateInvoiceInput({ restaurant, plan, invoiceDate, dueDate }) {
  if (!restaurant?.id) return 'Select a restaurant'
  if (!plan?.id && !restaurant.plan_id) return 'Assign a plan before creating an invoice'
  if (!plan?.id) return 'This restaurant has no plan assigned'
  const issued = String(invoiceDate || '').trim()
  const due = String(dueDate || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issued)) return 'Invoice date is required'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'Due date is required'
  if (due < issued) return 'Due date cannot be before the invoice date'
  const amount = moneyAmount(plan.price_inr)
  if (amount == null || amount < 0) return 'Plan price is invalid'
  return ''
}

export function buildInvoicePreview({ restaurant, plan, invoiceDate, dueDate, note }) {
  const error = validateInvoiceInput({ restaurant, plan, invoiceDate, dueDate })
  if (error) return { error, preview: null }
  const amount = moneyAmount(plan.price_inr)
  return {
    error: '',
    preview: {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name || 'Unnamed restaurant',
      assignmentId: restaurant.latest_assignment_id || null,
      planId: plan.id,
      planName: plan.name,
      planPriceInr: amount,
      billingCycle: plan.billing_cycle || '',
      customCycleDays: plan.custom_cycle_days || null,
      amountInr: amount,
      invoiceDate,
      dueDate,
      note: String(note || '').trim(),
      zeroPrice: amount === 0,
      status: amount === 0 ? 'paid' : 'pending',
    },
  }
}

export function invoiceCreatePayload(preview) {
  if (!preview) return null
  return {
    p_restaurant_id: preview.restaurantId,
    p_assignment_id: preview.assignmentId,
    p_plan_id: preview.planId,
    p_invoice_date: preview.invoiceDate,
    p_due_date: preview.dueDate,
    p_note: preview.note,
  }
}

export function validatePaymentInput({ invoice, amount, paymentDate, method, kind = 'payment' }) {
  if (!invoice?.id) return 'Select an invoice'
  if (invoice.status === 'cancelled') return 'This invoice is cancelled'
  if (kind === 'payment' && invoice.status === 'paid') return 'This invoice is already paid'
  const value = moneyAmount(amount)
  if (value == null || value <= 0) return 'Enter a payment amount greater than 0'
  const balance = outstandingBalance(invoice.amount_inr, invoice.paid_amount_inr)
  if (kind === 'payment') {
    if (balance == null) return 'Invoice amount is invalid'
    if (value > balance) return 'Payment cannot exceed the outstanding balance'
  }
  if (kind === 'refund') {
    const paid = moneyAmount(invoice.paid_amount_inr) || 0
    if (value > paid) return 'Refund cannot exceed the amount already paid'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(paymentDate || '').trim())) return 'Payment date is required'
  if (!PAYMENT_METHODS.some((row) => row.id === method)) return 'Select a payment method'
  return ''
}

export function paymentPayload({
  invoice,
  amount,
  paymentDate,
  method,
  reference,
  note,
  requestId,
  renew,
  validFrom,
  validUntil,
  kind = 'payment',
}) {
  const isRefund = kind === 'refund'
  const isRenew = Boolean(renew) && !isRefund
  return {
    p_invoice_id: invoice.id,
    p_amount: moneyAmount(amount),
    p_payment_date: paymentDate,
    p_method: method,
    p_reference: String(reference || '').trim(),
    p_note: String(note || '').trim(),
    p_request_id: requestId || null,
    p_renew: isRenew,
    p_valid_from: isRenew ? validFrom : null,
    p_valid_until: isRenew ? validUntil : null,
    p_kind: isRefund ? 'refund' : 'payment',
  }
}

export function applyPaymentToInvoice(invoice, amount, { today, dueDate } = {}) {
  const paid = moneyAmount((moneyAmount(invoice.paid_amount_inr) || 0) + Number(amount))
  const next = { ...invoice, paid_amount_inr: paid }
  next.balance_inr = outstandingBalance(next.amount_inr, paid)
  next.status = deriveInvoiceStatus({
    amount: next.amount_inr,
    paidAmount: paid,
    dueDate: dueDate || invoice.due_date,
    cancelled: invoice.status === 'cancelled',
    today,
  })
  return next
}

export function summarizeBilling(invoices, payments, { from, to } = {}) {
  const inRange = (value) => {
    if (!from && !to) return true
    const day = String(value || '').slice(0, 10)
    if (from && day < from) return false
    if (to && day > to) return false
    return true
  }
  const invoiceRows = (invoices || []).filter((row) => inRange(row.invoice_date) && row.status !== 'cancelled')
  const paymentRows = (payments || []).filter((row) => inRange(row.payment_date))
  let collected = 0
  for (const row of paymentRows) {
    const amount = moneyAmount(row.amount_inr) || 0
    collected += row.kind === 'refund' ? -amount : amount
  }
  let outstanding = 0
  let paidCount = 0
  let partialCount = 0
  let overdueCount = 0
  for (const row of invoiceRows) {
    const status = row.status
    const balance = outstandingBalance(row.amount_inr, row.paid_amount_inr) || 0
    outstanding += balance
    if (status === 'paid') paidCount += 1
    if (status === 'partial') partialCount += 1
    if (status === 'overdue') overdueCount += 1
  }
  return {
    collected: moneyAmount(collected) || 0,
    paidCount,
    partialCount,
    outstanding: moneyAmount(outstanding) || 0,
    overdueCount,
  }
}

export function snapshotIgnoresLaterPlanPrice(invoice, currentPlan) {
  return moneyAmount(invoice?.plan_price_inr) !== moneyAmount(currentPlan?.price_inr)
}

export function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function invoicePrintHtml(invoice, payments = []) {
  const rows = (payments || [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.receipt_number || '')}</td><td>${escapeHtml(String(row.payment_date || '').slice(0, 10))}</td><td>${escapeHtml(paymentMethodLabel(row.payment_method))}</td><td>${escapeHtml(String(row.amount_inr ?? ''))}</td><td>${escapeHtml(row.transaction_reference || '')}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoice_number || 'Invoice')}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;margin:24px}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#64748b;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
  th,td{border-bottom:1px solid #e2e8f0;text-align:left;padding:8px}
  .box{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-top:16px}
</style></head><body>
  <p class="muted">BSB Digital Menu — Subscription invoice (not a GST tax invoice)</p>
  <h1>${escapeHtml(invoice.invoice_number || 'Invoice')}</h1>
  <p>${escapeHtml(invoice.restaurant_name || '')}</p>
  <div class="box">
    <p>Plan: ${escapeHtml(invoice.plan_name || '')} — ${escapeHtml(String(invoice.plan_price_inr ?? ''))} INR</p>
    <p>Invoice date: ${escapeHtml(String(invoice.invoice_date || '').slice(0, 10))} · Due: ${escapeHtml(String(invoice.due_date || '').slice(0, 10))}</p>
    <p>Amount: ${escapeHtml(String(invoice.amount_inr ?? ''))} · Paid: ${escapeHtml(String(invoice.paid_amount_inr ?? ''))} · Balance: ${escapeHtml(String(invoice.balance_inr ?? outstandingBalance(invoice.amount_inr, invoice.paid_amount_inr) ?? ''))}</p>
    <p>Status: ${escapeHtml(invoiceStatusLabel(invoice.status))}</p>
    ${invoice.note ? `<p>Note: ${escapeHtml(invoice.note)}</p>` : ''}
  </div>
  <table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Amount</th><th>Reference</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5">No payments recorded</td></tr>'}</tbody></table>
</body></html>`
}

export function receiptPrintHtml(payment, invoice) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(payment.receipt_number || 'Receipt')}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;margin:24px}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#64748b;font-size:12px}
  .box{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-top:16px}
</style></head><body>
  <p class="muted">BSB Digital Menu — Subscription payment receipt (manual record, not a GST tax invoice)</p>
  <h1>${escapeHtml(payment.receipt_number || 'Receipt')}</h1>
  <div class="box">
    <p>Invoice: ${escapeHtml(invoice?.invoice_number || '')}</p>
    <p>Restaurant: ${escapeHtml(invoice?.restaurant_name || '')}</p>
    <p>Amount: ${escapeHtml(String(payment.amount_inr ?? ''))} INR</p>
    <p>Date: ${escapeHtml(String(payment.payment_date || '').slice(0, 10))}</p>
    <p>Method: ${escapeHtml(paymentMethodLabel(payment.payment_method))}</p>
    ${payment.transaction_reference ? `<p>Reference: ${escapeHtml(payment.transaction_reference)}</p>` : ''}
    ${payment.note ? `<p>Note: ${escapeHtml(payment.note)}</p>` : ''}
  </div>
</body></html>`
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function openPrintHtml(html) {
  if (typeof window === 'undefined') return
  const popup = window.open('', '_blank', 'noopener,noreferrer')
  if (!popup) return
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  popup.print()
}
