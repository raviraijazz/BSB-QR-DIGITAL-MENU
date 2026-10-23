import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import {
  cancelSubscriptionInvoice,
  createSubscriptionInvoice,
  getSubscriptionBillingSummary,
  getSubscriptionInvoice,
  listPlatformRestaurants,
  listSubscriptionInvoices,
  listSubscriptionPlans,
  recordSubscriptionPayment,
} from '../../services/platformAdmin'
import {
  RANGE_PRESETS,
  formatDate,
  formatDateTime,
  formatMoney,
  rangeFromDays,
  toDateInput,
} from '../../lib/platformAdmin'
import {
  VALIDITY_DURATION_OPTIONS,
  buildAssignmentPreview,
  durationIdFromDays,
  toDateInputUtc,
  todayUtcDate,
} from '../../lib/subscriptionPlans'
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_META,
  PAYMENT_METHODS,
  buildInvoicePreview,
  invoiceCreatePayload,
  invoicePrintHtml,
  newRequestId,
  openPrintHtml,
  outstandingBalance,
  paymentMethodLabel,
  paymentPayload,
  receiptPrintHtml,
  validatePaymentInput,
} from '../../lib/subscriptionBilling'

const PAGE_SIZE = 20

function todayInput() {
  return toDateInputUtc(todayUtcDate())
}

function StatusBadge({ status }) {
  const meta = INVOICE_STATUS_META[status] || INVOICE_STATUS_META.pending
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

function unwrap(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data || null
}

function InvoiceDrawer({ open, restaurants, plans, initialRestaurantId, onClose, onCreated }) {
  const [restaurantId, setRestaurantId] = useState(initialRestaurantId || '')
  const [invoiceDate, setInvoiceDate] = useState(todayInput())
  const [dueDate, setDueDate] = useState(todayInput())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setRestaurantId(initialRestaurantId || '')
    setInvoiceDate(todayInput())
    setDueDate(todayInput())
    setNote('')
    setError('')
    setBusy(false)
  }, [open, initialRestaurantId])

  const restaurant = restaurants.find((row) => row.id === restaurantId)
  const plan = plans.find((row) => row.id === restaurant?.plan_id)
  const previewResult = useMemo(
    () => (restaurant ? buildInvoicePreview({ restaurant, plan, invoiceDate, dueDate, note }) : { error: '', preview: null }),
    [restaurant, plan, invoiceDate, dueDate, note],
  )

  if (!open) return null

  async function onConfirm() {
    if (!previewResult.preview || previewResult.error) {
      setError(previewResult.error || 'Review the invoice before confirming.')
      return
    }
    setBusy(true)
    setError('')
    const { error: nextError } = await createSubscriptionInvoice(invoiceCreatePayload(previewResult.preview))
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true">
      <button type="button" className="h-full flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Create invoice</h2>
          <p className="mt-1 text-sm text-slate-500">
            Snapshots the current plan price. Creating an invoice does not activate, freeze, unblock, or expire this
            restaurant.
          </p>
        </div>
        <div className="flex-1 space-y-4 px-5 py-4">
          <Alert>{error}</Alert>
          <label className="block text-xs font-medium text-slate-500">
            Restaurant
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">Select a restaurant</option>
              {restaurants.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name || 'Unnamed restaurant'}
                  {row.plan_name ? ` — ${row.plan_name}` : ' — no plan'}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-500">
              Invoice date
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-500">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          {previewResult.preview ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700">
              <p>
                {previewResult.preview.restaurantName} · {previewResult.preview.planName} ·{' '}
                {formatMoney(previewResult.preview.amountInr)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                This is not a GST tax invoice. No discounts or tax are added.
              </p>
              {previewResult.preview.zeroPrice ? (
                <p className="mt-1 text-xs text-slate-600">
                  This plan is priced 0 INR. The invoice will be marked paid without recording a payment.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-600">Status after create: Pending. No payment is recorded.</p>
              )}
            </div>
          ) : previewResult.error ? (
            <p className="text-sm text-red-700">{previewResult.error}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={busy || !previewResult.preview || Boolean(previewResult.error)}
            onClick={onConfirm}
          >
            {busy ? 'Creating…' : 'Create invoice'}
          </Button>
        </div>
      </aside>
    </div>
  )
}

function PaymentDrawer({ open, invoice, restaurants, kind, onClose, onSaved }) {
  const balance = outstandingBalance(invoice?.amount_inr, invoice?.paid_amount_inr)
  const restaurant =
    restaurants.find((row) => row.id === invoice?.restaurant_id) ||
    (invoice
      ? {
          id: invoice.restaurant_id,
          name: invoice.restaurant_name,
          plan_id: invoice.plan_id,
          plan_name: invoice.plan_name,
          valid_from: invoice.valid_from,
          valid_until: invoice.valid_until,
        }
      : null)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayInput())
  const [method, setMethod] = useState('upi')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [renew, setRenew] = useState(false)
  const [startDate, setStartDate] = useState(todayInput())
  const [durationId, setDurationId] = useState('days_365')
  const [customDays, setCustomDays] = useState('365')
  const [exactDate, setExactDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestId, setRequestId] = useState('')

  useEffect(() => {
    if (!open || !invoice) return
    const nextBalance = outstandingBalance(invoice.amount_inr, invoice.paid_amount_inr)
    setAmount(kind === 'refund' ? String(invoice.paid_amount_inr || '') : String(nextBalance ?? ''))
    setPaymentDate(todayInput())
    setMethod('upi')
    setReference('')
    setNote('')
    setRenew(false)
    setStartDate(invoice.valid_until ? toDateInputUtc(invoice.valid_until) : todayInput())
    const suggested = durationIdFromDays(365)
    setDurationId(suggested?.id || 'days_365')
    setCustomDays(suggested?.customDays || '365')
    setExactDate('')
    setError('')
    setBusy(false)
    setRequestId(newRequestId())
  }, [open, invoice, kind])

  const isRefund = kind === 'refund'
  const validation = invoice
    ? validatePaymentInput({ invoice, amount, paymentDate, method, kind: isRefund ? 'refund' : 'payment' })
    : 'Select an invoice'

  const renewPreview = useMemo(() => {
    if (!renew || isRefund || !restaurant) return { error: '', preview: null }
    return buildAssignmentPreview({
      restaurant: {
        ...restaurant,
        valid_from: invoice?.valid_from || restaurant.valid_from,
        valid_until: invoice?.valid_until || restaurant.valid_until,
      },
      plan: { id: invoice.plan_id || restaurant.plan_id, name: invoice.plan_name || restaurant.plan_name, status: 'active' },
      changeValidity: true,
      startDate,
      durationId,
      customDays,
      exactDate,
    })
  }, [renew, isRefund, restaurant, invoice, startDate, durationId, customDays, exactDate])

  if (!open || !invoice) return null

  async function onConfirm() {
    if (validation) {
      setError(validation)
      return
    }
    if (renew && !isRefund && (renewPreview.error || !renewPreview.preview)) {
      setError(renewPreview.error || 'Review the new validity before renewing.')
      return
    }
    setBusy(true)
    setError('')
    const payload = paymentPayload({
      invoice,
      amount,
      paymentDate,
      method,
      reference,
      note,
      requestId,
      kind: isRefund ? 'refund' : 'payment',
      renew: renew && !isRefund,
      validFrom: renewPreview.preview?.validFrom,
      validUntil: renewPreview.preview?.validUntil,
    })
    const { data, error: nextError } = await recordSubscriptionPayment(payload)
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    onSaved(unwrap(data))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true">
      <button type="button" className="h-full flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{isRefund ? 'Record refund' : 'Record payment'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {invoice.invoice_number} · {invoice.restaurant_name} · Balance {formatMoney(balance)}
          </p>
        </div>
        <div className="flex-1 space-y-4 px-5 py-4">
          <Alert>{error}</Alert>
          <p className="text-xs text-slate-500">
            Manual founder record only. No gateway, UPI verification, or auto-charge. This is not a restaurant bill
            payment.
          </p>
          <label className="block text-xs font-medium text-slate-500">
            Amount (INR)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-500">
              Date
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
              >
                {PAYMENT_METHODS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-500">
            Transaction reference (optional)
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          {isRefund ? null : (
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={renew}
                  onChange={(e) => setRenew(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Also renew subscription validity
                  <span className="mt-1 block text-xs text-slate-500">
                    Off by default. Recording a payment does not change restaurant expiry unless this is confirmed.
                    Frozen or blocked status is not cleared.
                  </span>
                </span>
              </label>
              {renew ? (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-medium text-slate-500">
                    New start date
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Duration
                    <select
                      value={durationId}
                      onChange={(e) => setDurationId(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                    >
                      {VALIDITY_DURATION_OPTIONS.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {durationId === 'custom_days' ? (
                    <label className="block text-xs font-medium text-slate-500">
                      Custom days
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                      />
                    </label>
                  ) : null}
                  {durationId === 'exact_date' ? (
                    <label className="block text-xs font-medium text-slate-500">
                      Expiry date
                      <input
                        type="date"
                        value={exactDate}
                        onChange={(e) => setExactDate(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                      />
                    </label>
                  ) : null}
                  {renewPreview.preview ? (
                    <p className="text-sm text-slate-700">
                      New validity: {formatDate(renewPreview.preview.validFrom)} → {formatDate(renewPreview.preview.validUntil)}
                    </p>
                  ) : renewPreview.error ? (
                    <p className="text-sm text-red-700">{renewPreview.error}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {validation ? <p className="text-sm text-red-700">{validation}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={busy || Boolean(validation) || (renew && !isRefund && Boolean(renewPreview.error))}
            onClick={onConfirm}
          >
            {busy
              ? 'Saving…'
              : isRefund
                ? 'Record refund'
                : renew
                  ? 'Record Payment & Renew Subscription'
                  : 'Record payment'}
          </Button>
        </div>
      </aside>
    </div>
  )
}

function InvoiceDetail({ open, invoiceId, restaurants, onClose, onChanged }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payKind, setPayKind] = useState('')
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async () => {
    if (!invoiceId) return
    setLoading(true)
    setError('')
    const { data, error: nextError } = await getSubscriptionInvoice(invoiceId)
    if (nextError) {
      setError(nextError.message)
      setDetail(null)
    } else {
      setDetail(unwrap(data))
    }
    setLoading(false)
  }, [invoiceId])

  useEffect(() => {
    if (!open) return
    setNotice('')
    setPayKind('')
    setCancelReason('')
    load()
  }, [open, load])

  if (!open) return null

  const invoice = detail?.invoice
  const payments = detail?.payments || []

  async function onCancelInvoice() {
    if (!invoice) return
    setBusy(true)
    setError('')
    const { error: nextError } = await cancelSubscriptionInvoice(invoice.id, cancelReason)
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setNotice('Invoice cancelled.')
    load()
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true">
      <button type="button" className="h-full flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{invoice?.invoice_number || 'Invoice'}</h2>
          <p className="mt-1 text-sm text-slate-500">Subscription invoice snapshot. Later plan-price edits do not change this.</p>
        </div>
        <div className="flex-1 space-y-4 px-5 py-4">
          <Alert>{error}</Alert>
          <Alert type="success">{notice}</Alert>
          {loading ? (
            <p className="text-sm text-slate-400">Loading invoice…</p>
          ) : invoice ? (
            <>
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{invoice.restaurant_name}</p>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="mt-2">
                  Plan: {invoice.plan_name} · snapshot {formatMoney(invoice.plan_price_inr)}
                </p>
                <p>
                  Invoice {formatDate(invoice.invoice_date)} · Due {formatDate(invoice.due_date)}
                </p>
                <p>
                  Amount {formatMoney(invoice.amount_inr)} · Paid {formatMoney(invoice.paid_amount_inr)} · Balance{' '}
                  {formatMoney(invoice.balance_inr)}
                </p>
                {invoice.note ? <p className="mt-1 text-xs text-slate-500">{invoice.note}</p> : null}
                {invoice.cancelled_reason ? (
                  <p className="mt-1 text-xs text-red-600">Cancelled: {invoice.cancelled_reason}</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">Not a GST tax invoice. Restaurant order payments are separate.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => openPrintHtml(invoicePrintHtml(invoice, payments))}
                >
                  Print invoice
                </Button>
                {invoice.status === 'cancelled' || invoice.status === 'paid' ? null : (
                  <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setPayKind('payment')}>
                    Record payment
                  </Button>
                )}
                {invoice.paid_amount_inr > 0 && invoice.status !== 'cancelled' ? (
                  <Button variant="secondary" onClick={() => setPayKind('refund')}>
                    Record refund
                  </Button>
                ) : null}
              </div>
              {invoice.status !== 'cancelled' && Number(invoice.paid_amount_inr) === 0 ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <label className="block text-xs font-medium text-slate-500">
                    Cancel reason (optional)
                    <input
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                    />
                  </label>
                  <Button className="mt-3" variant="danger" disabled={busy} onClick={onCancelInvoice}>
                    {busy ? 'Cancelling…' : 'Cancel invoice'}
                  </Button>
                </div>
              ) : null}
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Payments</h3>
                {payments.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">No payments recorded.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {payments.map((row) => (
                      <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">
                            {row.receipt_number} · {row.kind === 'refund' ? 'Refund' : 'Payment'}
                          </p>
                          <button
                            type="button"
                            className="text-xs text-blue-700 hover:underline"
                            onClick={() => openPrintHtml(receiptPrintHtml(row, invoice))}
                          >
                            Print receipt
                          </button>
                        </div>
                        <p>
                          {formatMoney(row.amount_inr)} · {paymentMethodLabel(row.payment_method)} ·{' '}
                          {formatDate(row.payment_date)}
                        </p>
                        {row.transaction_reference ? (
                          <p className="text-xs text-slate-400">Ref {row.transaction_reference}</p>
                        ) : null}
                        {row.note ? <p className="text-xs text-slate-400">{row.note}</p> : null}
                        <p className="text-xs text-slate-400">{formatDateTime(row.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
      <PaymentDrawer
        open={Boolean(payKind)}
        invoice={invoice}
        restaurants={restaurants}
        kind={payKind}
        onClose={() => setPayKind('')}
        onSaved={() => {
          setNotice('Payment recorded.')
          load()
          onChanged()
        }}
      />
    </div>
  )
}

export default function PlatformAdminBilling() {
  const [searchParams] = useSearchParams()
  const initial = useMemo(() => rangeFromDays(90), [])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [planId, setPlanId] = useState('')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [from, setFrom] = useState(toDateInput(initial.from))
  const [to, setTo] = useState(toDateInput(initial.to))
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [plans, setPlans] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(Boolean(searchParams.get('restaurant')))
  const [detailId, setDetailId] = useState(searchParams.get('invoice') || '')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [invoiceResult, summaryResult, planResult, restaurantResult] = await Promise.all([
      listSubscriptionInvoices({
        search: query,
        planId: planId || null,
        status,
        method,
        from,
        to,
        page,
        pageSize: PAGE_SIZE,
      }),
      getSubscriptionBillingSummary({ from, to }),
      listSubscriptionPlans(false),
      listPlatformRestaurants({ pageSize: 100 }),
    ])
    if (invoiceResult.error || summaryResult.error || planResult.error || restaurantResult.error) {
      setError(
        invoiceResult.error?.message ||
          summaryResult.error?.message ||
          planResult.error?.message ||
          restaurantResult.error?.message,
      )
    }
    const rows = Array.isArray(invoiceResult.data) ? invoiceResult.data : []
    setItems(rows)
    setTotal(Number(rows[0]?.total_count) || 0)
    setSummary(unwrap(summaryResult.data))
    setPlans(planResult.data || [])
    setRestaurants(restaurantResult.data?.items || [])
    setLoading(false)
  }, [query, planId, status, method, from, to, page])

  useEffect(() => {
    load()
  }, [load])

  function onSearchSubmit(event) {
    event.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  function applyPreset(preset) {
    const range = rangeFromDays(preset.days)
    setFrom(toDateInput(range.from))
    setTo(toDateInput(range.to))
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payments & History</h1>
          <p className="mt-1 text-sm text-slate-500">
            Founder-only subscription invoices and manual payment records. This is not restaurant order collections and
            not a GST tax invoice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/platform-admin/subscriptions"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Plans catalog
          </Link>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setCreateOpen(true)}>
            Create invoice
          </Button>
        </div>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Collected" value={summary ? formatMoney(summary.collected) : '—'} hint="Payments minus refunds" />
        <Metric label="Paid invoices" value={summary ? String(summary.paid_count ?? 0) : '—'} />
        <Metric label="Partial" value={summary ? String(summary.partial_count ?? 0) : '—'} />
        <Metric label="Outstanding" value={summary ? formatMoney(summary.outstanding) : '—'} />
        <Metric label="Overdue" value={summary ? String(summary.overdue_count ?? 0) : '—'} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={onSearchSubmit} className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-xs font-medium text-slate-500">
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Invoice number or restaurant"
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Plan
            <select
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value)
                setPage(1)
              }}
              className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">All plans</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">All statuses</option>
              {INVOICE_STATUSES.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Method
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value)
                setPage(1)
              }}
              className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            Search
          </Button>
        </form>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          Loading invoices...
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          body={
            query || status || planId || method
              ? 'No invoices match the current search and filters.'
              : 'Create an invoice from a restaurant that already has a plan. No sample invoices are seeded.'
          }
          actionLabel="Create invoice"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Restaurant</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Paid / Balance</th>
                  <th className="px-5 py-3 font-medium">Dates</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.invoice_number}</td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/platform-admin/restaurants/${row.restaurant_id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {row.restaurant_name || 'Unnamed restaurant'}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.plan_name || '—'}
                      <p className="text-xs text-slate-400">Snapshot {formatMoney(row.plan_price_inr)}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatMoney(row.amount_inr)}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatMoney(row.paid_amount_inr)}
                      <p className="text-xs text-slate-400">Bal {formatMoney(row.balance_inr)}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatDate(row.invoice_date)}
                      <p className="text-xs text-slate-400">Due {formatDate(row.due_date)}</p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                      {row.payment_method ? (
                        <p className="mt-1 text-xs text-slate-400">{paymentMethodLabel(row.payment_method)}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        className="text-xs text-blue-700 hover:underline"
                        onClick={() => setDetailId(row.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Showing {start}–{end} of {total} · page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
            >
              Next
            </Button>
          </div>
        </>
      )}

      <InvoiceDrawer
        open={createOpen}
        restaurants={restaurants}
        plans={plans}
        initialRestaurantId={searchParams.get('restaurant') || ''}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setNotice('Invoice created. Restaurant validity is unchanged.')
          load()
        }}
      />
      <InvoiceDetail
        open={Boolean(detailId)}
        invoiceId={detailId}
        restaurants={restaurants}
        onClose={() => setDetailId('')}
        onChanged={load}
      />
    </div>
  )
}
