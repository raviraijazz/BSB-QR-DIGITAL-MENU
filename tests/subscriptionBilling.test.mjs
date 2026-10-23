import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPaymentToInvoice,
  buildInvoicePreview,
  deriveInvoiceStatus,
  formatInvoiceNumber,
  formatReceiptNumber,
  invoiceCreatePayload,
  moneyAmount,
  outstandingBalance,
  paymentPayload,
  snapshotIgnoresLaterPlanPrice,
  summarizeBilling,
  validateInvoiceInput,
  validatePaymentInput,
} from '../src/lib/subscriptionBilling.js'

test('invoice and receipt numbers are sequential and unique-looking', () => {
  assert.equal(formatInvoiceNumber(2026, 1), 'BSB-SUB-2026-000001')
  assert.equal(formatInvoiceNumber(2026, 12), 'BSB-SUB-2026-000012')
  assert.notEqual(formatInvoiceNumber(2026, 1), formatInvoiceNumber(2026, 2))
  assert.equal(formatReceiptNumber(2026, 3), 'BSB-RCP-2026-000003')
})

test('invoice creation snapshots the current plan price and stays pending until paid', () => {
  const restaurant = { id: 'r1', name: 'Cafe', plan_id: 'p1', latest_assignment_id: 'a1' }
  const plan = { id: 'p1', name: 'Gold', price_inr: 12000, billing_cycle: 'yearly' }
  const { error, preview } = buildInvoicePreview({
    restaurant,
    plan,
    invoiceDate: '2026-04-01',
    dueDate: '2026-04-10',
    note: ' April ',
  })
  assert.equal(error, '')
  assert.equal(preview.planPriceInr, 12000)
  assert.equal(preview.amountInr, 12000)
  assert.equal(preview.status, 'pending')
  assert.equal(preview.zeroPrice, false)
  assert.equal(preview.note, 'April')
  assert.deepEqual(invoiceCreatePayload(preview).p_plan_id, 'p1')
})

test('zero-price plans create a paid invoice without inventing a payment', () => {
  const { preview } = buildInvoicePreview({
    restaurant: { id: 'r1', plan_id: 'p1' },
    plan: { id: 'p1', name: 'Trial', price_inr: 0, billing_cycle: 'monthly' },
    invoiceDate: '2026-04-01',
    dueDate: '2026-04-01',
  })
  assert.equal(preview.amountInr, 0)
  assert.equal(preview.zeroPrice, true)
  assert.equal(preview.status, 'paid')
})

test('validateInvoiceInput requires restaurant, plan, and due date order', () => {
  assert.equal(validateInvoiceInput({ restaurant: null, plan: { id: 'p' }, invoiceDate: '2026-01-01', dueDate: '2026-01-02' }), 'Select a restaurant')
  assert.equal(
    validateInvoiceInput({ restaurant: { id: 'r1' }, plan: null, invoiceDate: '2026-01-01', dueDate: '2026-01-02' }),
    'Assign a plan before creating an invoice',
  )
  assert.equal(
    validateInvoiceInput({
      restaurant: { id: 'r1', plan_id: 'p1' },
      plan: { id: 'p1', price_inr: 10 },
      invoiceDate: '2026-01-10',
      dueDate: '2026-01-01',
    }),
    'Due date cannot be before the invoice date',
  )
})

test('full and partial payments update paid amount, balance and status', () => {
  const invoice = { id: 'i1', amount_inr: 1000, paid_amount_inr: 0, due_date: '2026-12-31', status: 'pending' }
  const partial = applyPaymentToInvoice(invoice, 400, { today: new Date('2026-04-01T00:00:00Z') })
  assert.equal(partial.paid_amount_inr, 400)
  assert.equal(partial.balance_inr, 600)
  assert.equal(partial.status, 'partial')
  const paid = applyPaymentToInvoice(partial, 600, { today: new Date('2026-04-01T00:00:00Z') })
  assert.equal(paid.paid_amount_inr, 1000)
  assert.equal(paid.balance_inr, 0)
  assert.equal(paid.status, 'paid')
})

test('multiple payments never exceed the outstanding balance', () => {
  const invoice = { id: 'i1', amount_inr: 500, paid_amount_inr: 400, status: 'partial' }
  assert.equal(
    validatePaymentInput({ invoice, amount: 150, paymentDate: '2026-04-01', method: 'upi' }),
    'Payment cannot exceed the outstanding balance',
  )
  assert.equal(validatePaymentInput({ invoice, amount: 100, paymentDate: '2026-04-01', method: 'cash' }), '')
})

test('overdue is derived from due date while a balance remains', () => {
  assert.equal(
    deriveInvoiceStatus({ amount: 100, paidAmount: 0, dueDate: '2026-01-01', today: new Date('2026-04-01T00:00:00Z') }),
    'overdue',
  )
  assert.equal(
    deriveInvoiceStatus({ amount: 100, paidAmount: 40, dueDate: '2026-01-01', today: new Date('2026-04-01T00:00:00Z') }),
    'overdue',
  )
  assert.equal(
    deriveInvoiceStatus({ amount: 100, paidAmount: 100, dueDate: '2026-01-01', today: new Date('2026-04-01T00:00:00Z') }),
    'paid',
  )
  assert.equal(deriveInvoiceStatus({ amount: 100, paidAmount: 0, dueDate: '2026-12-31', cancelled: true }), 'cancelled')
})

test('historical invoice snapshot is unchanged when the live plan price is edited', () => {
  const invoice = { plan_price_inr: 999, amount_inr: 999 }
  const currentPlan = { price_inr: 1500 }
  assert.equal(snapshotIgnoresLaterPlanPrice(invoice, currentPlan), true)
  assert.equal(moneyAmount(invoice.amount_inr), 999)
})

test('payment payload does not send validity unless renewal is explicitly requested', () => {
  const invoice = { id: 'i1', amount_inr: 100, paid_amount_inr: 0 }
  assert.deepEqual(
    paymentPayload({
      invoice,
      amount: 100,
      paymentDate: '2026-04-01',
      method: 'upi',
      reference: 'TXN1',
      note: ' paid ',
      requestId: 'req-1',
      renew: false,
      validFrom: '2026-04-01T00:00:00.000Z',
      validUntil: '2027-04-01T00:00:00.000Z',
    }),
    {
      p_invoice_id: 'i1',
      p_amount: 100,
      p_payment_date: '2026-04-01',
      p_method: 'upi',
      p_reference: 'TXN1',
      p_note: 'paid',
      p_request_id: 'req-1',
      p_renew: false,
      p_valid_from: null,
      p_valid_until: null,
      p_kind: 'payment',
    },
  )
  const renewing = paymentPayload({
    invoice,
    amount: 100,
    paymentDate: '2026-04-01',
    method: 'cash',
    renew: true,
    validFrom: '2026-04-01T00:00:00.000Z',
    validUntil: '2027-04-01T00:00:00.000Z',
  })
  assert.equal(renewing.p_renew, true)
  assert.equal(renewing.p_valid_until, '2027-04-01T00:00:00.000Z')
})

test('billing summary uses payment rows so partials are not double-counted', () => {
  const invoices = [
    { invoice_date: '2026-04-01', amount_inr: 1000, paid_amount_inr: 400, status: 'partial' },
    { invoice_date: '2026-04-02', amount_inr: 500, paid_amount_inr: 500, status: 'paid' },
    { invoice_date: '2026-04-03', amount_inr: 200, paid_amount_inr: 0, status: 'overdue' },
    { invoice_date: '2026-04-04', amount_inr: 50, paid_amount_inr: 0, status: 'cancelled' },
  ]
  const payments = [
    { payment_date: '2026-04-01', amount_inr: 400, kind: 'payment' },
    { payment_date: '2026-04-02', amount_inr: 500, kind: 'payment' },
  ]
  const summary = summarizeBilling(invoices, payments, { from: '2026-04-01', to: '2026-04-30' })
  assert.equal(summary.collected, 900)
  assert.equal(summary.paidCount, 1)
  assert.equal(summary.partialCount, 1)
  assert.equal(summary.overdueCount, 1)
  assert.equal(summary.outstanding, 800)
})

test('duplicate request id is represented as the same payload identity', () => {
  const invoice = { id: 'i1', amount_inr: 80, paid_amount_inr: 0, status: 'pending' }
  const first = paymentPayload({ invoice, amount: 80, paymentDate: '2026-04-01', method: 'card', requestId: 'same' })
  const second = paymentPayload({ invoice, amount: 80, paymentDate: '2026-04-01', method: 'card', requestId: 'same' })
  assert.equal(first.p_request_id, second.p_request_id)
})

test('refund payload never requests renewal', () => {
  const invoice = { id: 'i1', amount_inr: 100, paid_amount_inr: 40, status: 'partial' }
  const payload = paymentPayload({
    invoice,
    amount: 40,
    paymentDate: '2026-04-01',
    method: 'cash',
    kind: 'refund',
    renew: true,
    validFrom: '2026-04-01T00:00:00.000Z',
    validUntil: '2027-04-01T00:00:00.000Z',
  })
  assert.equal(payload.p_kind, 'refund')
  assert.equal(payload.p_renew, false)
  assert.equal(payload.p_valid_from, null)
  assert.equal(payload.p_valid_until, null)
})

test('refund cannot exceed amount already paid', () => {
  const invoice = { id: 'i1', amount_inr: 100, paid_amount_inr: 40, status: 'partial' }
  assert.equal(
    validatePaymentInput({ invoice, amount: 50, paymentDate: '2026-04-01', method: 'cash', kind: 'refund' }),
    'Refund cannot exceed the amount already paid',
  )
  assert.equal(validatePaymentInput({ invoice, amount: 40, paymentDate: '2026-04-01', method: 'cash', kind: 'refund' }), '')
})

test('outstanding balance never goes negative', () => {
  assert.equal(outstandingBalance(100, 100), 0)
  assert.equal(outstandingBalance(100, 130), 0)
})
