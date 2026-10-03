import { useEffect, useMemo, useState } from 'react'
import Alert from '../Alert'
import Button from '../Button'
import Field, { inputClass } from '../Field'
import NavIcon from '../NavIcon'
import EmptyState from '../EmptyState'
import { aggregateOrderItems, billBalance, calculateBill, restaurantTaxSettings, splitDraftTotal } from '../../lib/billing'
import {
  billStatusLabel,
  elapsedLabel,
  firstRelated,
  formatBillMoney,
  formatClock,
  formatQty,
  kotStatusLabel,
  kotTypeLabel,
  moneyRound,
  orderStatusLabel,
  PAYMENT_METHODS,
  paymentMethodLabel,
} from '../../lib/orderCart'
import { sessionTablesLabel, tableHeading } from '../../lib/tableToken'
import { kotForOrder } from '../../services/kots'
import { waiterLabel } from '../../services/bills'
import { orderSubtotal } from '../../services/waiterOrders'

const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'kots', label: 'KOTs' },
  { id: 'timeline', label: 'Timeline' },
]

function configuredTaxRates(restaurant) {
  const rows = []
  if (Array.isArray(restaurant?.tax_rates)) {
    for (const value of restaurant.tax_rates) {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) rows.push(n)
    }
  }
  const single = Number(restaurant?.tax_rate ?? restaurant?.gst_rate)
  if (Number.isFinite(single) && single > 0) rows.push(single)
  return [...new Set(rows.map((n) => moneyRound(n)))]
}

function statusTone(status) {
  if (status === 'paid') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (status === 'payment_pending') return 'bg-amber-50 text-amber-900 border-amber-200'
  return 'bg-forest/10 text-forest border-forest/15'
}

function methodTone(method) {
  if (method === 'upi') return 'bg-sky-50 text-sky-800'
  if (method === 'card') return 'bg-indigo-50 text-indigo-800'
  return 'bg-emerald-50 text-emerald-800'
}

function SectionCard({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-4 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{title}</h3> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function pillClass(active, tone = 'ink') {
  if (active && tone === 'forest') return 'bg-forest text-[#f5ead8] shadow-sm'
  if (active) return 'bg-ink text-white shadow-sm'
  return 'border border-line bg-white text-muted hover:text-ink'
}

export default function BillWorkspace({
  view,
  restaurant,
  payments,
  working,
  collecting,
  notice,
  error,
  payError,
  onBack,
  onRefresh,
  onSave,
  onCollect,
  onMerge,
  onTransfer,
}) {
  const [tab, setTab] = useState('orders')
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmSettle, setConfirmSettle] = useState(false)
  const [discountType, setDiscountType] = useState(view.discountType || 'percent')
  const [discountValue, setDiscountValue] = useState(view.discountValue ? String(view.discountValue) : '')
  const restaurantTax = restaurantTaxSettings(restaurant)
  const [taxEnabled, setTaxEnabled] = useState(Boolean(view.tax?.enabled || restaurantTax.enabled))
  const [taxMode, setTaxMode] = useState(view.tax?.mode || restaurantTax.mode || 'exclusive')
  const [taxRate, setTaxRate] = useState(String(view.tax?.rate || restaurantTax.rate || ''))
  const [payMode, setPayMode] = useState('single')
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [splits, setSplits] = useState([{ id: 'p1', method: 'cash', amount: '', reference: '' }])

  const billPayments = payments || []
  const tax = {
    enabled: taxEnabled,
    mode: taxMode,
    rate: Number(taxRate) || 0,
    serviceRate: restaurantTax.serviceRate || view.tax?.serviceRate || 0,
  }
  const preview = calculateBill({
    subtotal: view.subtotal,
    discountType,
    discountValue,
    tax,
  })
  const balance = billBalance(preview.payable, billPayments)
  const hasPayments = billPayments.length > 0
  const canEdit = !hasPayments && view.status === 'open'
  const emptyOrders = view.orderCount === 0
  const tableLabel = view.sessionTables?.length
    ? sessionTablesLabel(view.sessionTables, { compact: true })
    : view.table
      ? tableHeading(view.table)
      : 'Table'
  const rates = configuredTaxRates(restaurant)
  const items = useMemo(() => aggregateOrderItems(view.orders), [view.orders])
  const kots = useMemo(
    () =>
      (view.orders || [])
        .flatMap((order) => {
          const kot = kotForOrder(order)
          return kot ? [{ kot, order }] : []
        })
        .sort((a, b) => new Date(a.kot.created_at) - new Date(b.kot.created_at)),
    [view.orders],
  )

  useEffect(() => {
    setDiscountType(view.discountType || 'percent')
    setDiscountValue(view.discountValue ? String(view.discountValue) : '')
    setTaxEnabled(Boolean(view.tax?.enabled || restaurantTax.enabled))
    setTaxMode(view.tax?.mode || restaurantTax.mode || 'exclusive')
    setTaxRate(String(view.tax?.rate || restaurantTax.rate || ''))
    setPayMode('single')
    setMethod('cash')
    setReference('')
    setSplits([{ id: 'p1', method: 'cash', amount: '', reference: '' }])
    setConfirmSettle(false)
  }, [view.session?.id])

  useEffect(() => {
    setAmount(balance.remaining ? String(balance.remaining) : '')
    setSplits((rows) => {
      if (rows.length === 1 && !rows[0].amount) {
        return [{ ...rows[0], amount: balance.remaining ? String(balance.remaining) : '' }]
      }
      return rows
    })
  }, [balance.remaining, view.bill?.id])

  const timeline = useMemo(() => {
    const rows = []
    if (view.session?.started_at) {
      rows.push({ id: `s-${view.session.id}`, at: view.session.started_at, title: 'Session started', detail: tableLabel })
    }
    for (const order of view.orders || []) {
      rows.push({
        id: `o-${order.id}`,
        at: order.created_at,
        title: `Order #${order.order_number}`,
        detail: `${orderStatusLabel(order.status)} · ${formatBillMoney(orderSubtotal(order.order_items))}`,
      })
      const kot = kotForOrder(order)
      if (kot) {
        rows.push({
          id: `k-${kot.id}`,
          at: kot.created_at,
          title: `KOT #${kot.kot_number}`,
          detail: `${kotTypeLabel(kot.kot_type)} · ${kotStatusLabel(kot.status)}`,
        })
      }
    }
    for (const row of billPayments) {
      rows.push({
        id: `p-${row.id}`,
        at: row.paid_at || row.created_at,
        title: paymentMethodLabel(row.payment_method),
        detail: formatBillMoney(row.amount),
      })
    }
    return rows.sort((a, b) => new Date(a.at) - new Date(b.at))
  }, [view.orders, view.session, billPayments, tableLabel])

  function currentTax() {
    return tax
  }

  function submitDiscount(event) {
    event?.preventDefault?.()
    const raw = String(discountValue || '').trim()
    if (raw === '') {
      onSave(null, 0, currentTax())
      return
    }
    const numeric = Number(raw)
    if (!Number.isFinite(numeric) || numeric < 0) {
      onSave(discountType, -1, currentTax())
      return
    }
    onSave(discountType, numeric, currentTax())
  }

  function submitTax(event) {
    event?.preventDefault?.()
    onSave(view.discountType, view.discountValue, currentTax())
  }

  function submitSingle(event) {
    event.preventDefault()
    const numeric = moneyRound(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      onCollect({ error: 'Enter a payment amount.' })
      return
    }
    if (numeric > balance.remaining + 0.001) {
      onCollect({ error: 'Payment cannot exceed the remaining balance.' })
      return
    }
    const payload = {
      method,
      amount: numeric,
      reference: method === 'cash' ? '' : String(reference || '').trim(),
    }
    if (numeric >= balance.remaining - 0.001) {
      setConfirmSettle(payload)
      return
    }
    onCollect(payload)
  }

  function plannedSplits() {
    return splits
      .map((row) => ({
        ...row,
        amount: moneyRound(row.amount),
        reference: row.method === 'cash' ? '' : String(row.reference || '').trim(),
      }))
      .filter((row) => row.amount > 0)
  }

  function submitSplits() {
    const rows = plannedSplits()
    const total = splitDraftTotal(rows)
    if (!rows.length) {
      onCollect({ error: 'Enter a payment amount.' })
      return
    }
    if (rows.some((row) => !['cash', 'upi', 'card'].includes(row.method))) {
      onCollect({ error: 'Choose Cash, UPI or Card.' })
      return
    }
    if (total > balance.remaining + 0.001) {
      onCollect({ error: 'Payment cannot exceed the remaining balance.' })
      return
    }
    if (Math.abs(total - balance.remaining) <= 0.001) {
      setConfirmSettle({ splits: rows })
      return
    }
    onCollect({ splits: rows })
  }

  const splitTotal = splitDraftTotal(plannedSplits())
  const splitRemaining = moneyRound(Math.max(0, balance.remaining - splitTotal))

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-line bg-card px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={onBack} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
              Running Bills
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl leading-none">{tableLabel}</h1>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusTone(view.status)}`}>
                {billStatusLabel(view.status).toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {view.session?.session_number || 'Session'}
              {view.bill?.bill_number ? ` · ${view.bill.bill_number}` : ''}
              {' · '}
              {waiterLabel(view.waiter)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Started {formatClock(view.session?.started_at)}
              {elapsedLabel(view.session?.started_at) ? ` · ${elapsedLabel(view.session?.started_at)}` : ''}
              {' · '}
              {view.orderCount} {view.orderCount === 1 ? 'order' : 'orders'}
              {' · '}
              {view.itemCount} items
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="rounded-xl shadow-sm" onClick={onMerge}>
              Merge Tables
            </Button>
            <Button variant="secondary" className="rounded-xl shadow-sm" onClick={onTransfer}>
              Transfer Table
            </Button>
            <Button variant="secondary" className="rounded-xl shadow-sm" onClick={onRefresh}>
              Refresh
            </Button>
            <div className="relative">
              <Button variant="secondary" className="rounded-xl px-3 shadow-sm" onClick={() => setMoreOpen((value) => !value)} aria-label="More">
                <NavIcon name="more" className="h-4 w-4" />
              </Button>
              {moreOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => { setMoreOpen(false); onBack() }}>
                    All running bills
                  </button>
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => { setMoreOpen(false); onRefresh() }}>
                    Refresh bill
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(18rem,0.8fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <SectionCard
            title="Orders"
            action={
              <div className="flex gap-1">
                {TABS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTab(option.id)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium ${pillClass(tab === option.id)}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          >
            {emptyOrders ? (
              <EmptyState title="Waiting for first order" body="This table session is open. The running bill appears after the first order is placed." />
            ) : tab === 'orders' ? (
              <div className="space-y-3">
                {view.orders.map((order) => {
                  const orderItems = order.order_items || []
                  const orderWaiter = waiterLabel(firstRelated(order.waiters) || view.waiter)
                  return (
                    <article key={order.id} className="rounded-2xl border border-line bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-lg">Order #{order.order_number}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {formatClock(order.created_at)} · {orderWaiter}
                          </p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(order.status === 'served' ? 'paid' : 'open')}`}>
                          {orderStatusLabel(order.status)}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {orderItems.map((item) => (
                          <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3">
                            <span className="min-w-0">
                              {item.item_name} ×{formatQty(item.quantity)}
                              {item.notes ? <span className="mt-0.5 block text-xs text-muted">{item.notes}</span> : null}
                            </span>
                            <span className="tabular-nums text-muted">{formatBillMoney(item.unit_price)}</span>
                            <span className="tabular-nums">{formatBillMoney(item.line_total)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-medium">
                        <span>Order Subtotal</span>
                        <span className="tabular-nums">{formatBillMoney(orderSubtotal(orderItems))}</span>
                      </p>
                    </article>
                  )
                })}
              </div>
            ) : tab === 'kots' ? (
              kots.length ? (
                <div className="space-y-3">
                  {kots.map(({ kot, order }) => (
                    <article key={kot.id} className="rounded-2xl border border-line bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-lg">KOT #{kot.kot_number}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {formatClock(kot.created_at)} · Order #{order.order_number} · {kotTypeLabel(kot.kot_type)}
                          </p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(kot.status === 'ready' ? 'paid' : kot.status === 'preparing' ? 'payment_pending' : 'open')}`}>
                          {kotStatusLabel(kot.status)}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {(kot.kot_items || []).map((item) => (
                          <li key={item.id} className="flex justify-between gap-3">
                            <span>{item.item_name} ×{formatQty(item.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted">No kitchen tickets for this session yet.</p>
              )
            ) : timeline.length ? (
              <ol className="space-y-3">
                {timeline.map((row) => (
                  <li key={row.id} className="flex gap-3 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted">{formatClock(row.at)}</span>
                    <span>
                      <span className="block font-medium">{row.title}</span>
                      <span className="block text-xs text-muted">{row.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-8 text-center text-sm text-muted">No activity yet.</p>
            )}
          </SectionCard>

          <SectionCard title="All Items">
            {items.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 text-right font-medium">Qty</th>
                      <th className="pb-2 text-right font-medium">Rate</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.rows.map((row) => (
                      <tr key={`${row.name}-${row.rate}`} className="border-b border-line last:border-b-0">
                        <td className="py-2">{row.name}</td>
                        <td className="py-2 text-right tabular-nums">{formatQty(row.qty)}</td>
                        <td className="py-2 text-right tabular-nums">{formatBillMoney(row.rate)}</td>
                        <td className="py-2 text-right tabular-nums">{formatBillMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex justify-between text-sm font-medium">
                  <span>Total Items {formatQty(items.qty)}</span>
                  <span className="tabular-nums">{formatBillMoney(items.amount)}</span>
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted">No items yet</p>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Bill Summary">
            <p className="font-display text-xl">{tableLabel}</p>
            <p className="mt-1 text-sm text-muted">
              {view.session?.session_number || 'Session'} · {waiterLabel(view.waiter)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatBillMoney(preview.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Discount</dt>
                <dd className="tabular-nums text-emerald-800">{preview.discountAmount ? `-${formatBillMoney(preview.discountAmount)}` : 'None'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Taxable Value</dt>
                <dd className="tabular-nums">{formatBillMoney(preview.taxable)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{preview.taxMode === 'inclusive' ? 'GST (included)' : 'GST / Tax'}</dt>
                <dd className="tabular-nums">{preview.taxAmount ? formatBillMoney(preview.taxAmount) : 'None'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Service Charge</dt>
                <dd className="tabular-nums">{preview.serviceCharge ? formatBillMoney(preview.serviceCharge) : 'None'}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-3 font-display text-2xl">
                <dt>Grand Total</dt>
                <dd className="tabular-nums">{formatBillMoney(preview.payable)}</dd>
              </div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-emerald-800">Paid Amount</p>
                <p className="mt-1 font-display text-2xl tabular-nums text-emerald-900">{formatBillMoney(balance.paid)}</p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-rose-800">Remaining</p>
                <p className="mt-1 font-display text-2xl tabular-nums text-rose-900">{formatBillMoney(balance.remaining)}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Collect Payment">
            {view.status === 'paid' || balance.remaining <= 0 ? (
              <div className="rounded-2xl bg-emerald-50 px-4 py-6 text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-800">Payment Successful</p>
                <p className="mt-2 font-display text-3xl tabular-nums">{formatBillMoney(preview.payable)}</p>
                <p className="mt-2 text-sm font-medium text-forest">Table Session Closed</p>
              </div>
            ) : (
              <>
                <p className="font-display text-3xl tabular-nums leading-none">{formatBillMoney(balance.remaining)}</p>
                <p className="mt-1 text-xs text-muted">Amount Due</p>
                <div className="mt-3 flex gap-1.5" role="group" aria-label="Payment mode">
                  {[
                    { id: 'single', label: 'Single' },
                    { id: 'split', label: 'Split' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPayMode(option.id)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${pillClass(payMode === option.id, 'forest')}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Alert>{payError}</Alert>
                {payMode === 'single' ? (
                  <form className="mt-3 space-y-3" onSubmit={submitSingle}>
                    <div className="flex gap-1.5" role="group" aria-label="Payment method">
                      {PAYMENT_METHODS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setMethod(option.id)}
                          className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${method === option.id ? methodTone(option.id) + ' ring-1 ring-current' : 'border border-line bg-white text-muted'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <Field label="Amount">
                      <input className={inputClass} type="number" min="0.01" step="0.01" max={balance.remaining} value={amount} onChange={(event) => setAmount(event.target.value)} />
                    </Field>
                    {method !== 'cash' ? (
                      <Field label="Reference" hint="Optional">
                        <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} placeholder={method === 'upi' ? 'UPI ref' : 'Card ref'} />
                      </Field>
                    ) : null}
                    <Button type="submit" className="w-full bg-forest hover:bg-forest-deep" disabled={collecting || emptyOrders}>
                      {collecting ? 'Recording...' : 'Add Payment'}
                    </Button>
                  </form>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-line bg-paper/70 px-3 py-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted">Total Due</span>
                        <span className="font-medium tabular-nums">{formatBillMoney(balance.remaining)}</span>
                      </div>
                    </div>
                    {splits.map((row, index) => (
                      <div key={row.id} className="rounded-2xl border border-line bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Payment {index + 1}</p>
                          {splits.length > 1 ? (
                            <button
                              type="button"
                              className="text-xs text-rose-700"
                              onClick={() => setSplits((current) => current.filter((item) => item.id !== row.id))}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {PAYMENT_METHODS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setSplits((current) => current.map((item) => (item.id === row.id ? { ...item, method: option.id } : item)))}
                              className={`rounded-full px-3 py-1 text-[12px] font-medium ${row.method === option.id ? methodTone(option.id) + ' ring-1 ring-current' : 'border border-line bg-paper text-muted'}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Field label="Amount">
                            <input
                              className={inputClass}
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={row.amount}
                              onChange={(event) => setSplits((current) => current.map((item) => (item.id === row.id ? { ...item, amount: event.target.value } : item)))}
                            />
                          </Field>
                          {row.method !== 'cash' ? (
                            <Field label="Reference" hint="Optional">
                              <input
                                className={inputClass}
                                value={row.reference}
                                onChange={(event) => setSplits((current) => current.map((item) => (item.id === row.id ? { ...item, reference: event.target.value } : item)))}
                              />
                            </Field>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Total Paid</span>
                      <span className="tabular-nums">{formatBillMoney(splitTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Remaining</span>
                      <span className={`tabular-nums ${splitRemaining ? 'text-rose-800' : 'text-forest'}`}>{formatBillMoney(splitRemaining)}</span>
                    </div>
                    {splitRemaining > 0 ? (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => setSplits((current) => [...current, { id: `p${Date.now()}`, method: 'upi', amount: String(splitRemaining), reference: '' }])}
                      >
                        Add Another Payment
                      </Button>
                    ) : null}
                    <Button className="w-full bg-forest hover:bg-forest-deep" disabled={collecting || emptyOrders || splitTotal <= 0} onClick={submitSplits}>
                      {collecting ? 'Recording...' : splitRemaining === 0 ? 'Settle Bill' : 'Record Payments'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <SectionCard title="Discount">
            <form className="space-y-3" onSubmit={submitDiscount}>
              <div className="flex gap-1.5" role="group" aria-label="Discount type">
                {[
                  { id: 'percent', label: 'Percentage' },
                  { id: 'amount', label: 'Amount' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setDiscountType(option.id)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${pillClass(discountType === option.id, 'forest')}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Field
                label="Discount Value"
                hint={
                  canEdit
                    ? preview.warning || (discountType === 'percent' ? 'Max allowed 100%' : `Max allowed ${formatBillMoney(view.subtotal)}`)
                    : 'Discount cannot change after a payment is recorded.'
                }
              >
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  max={discountType === 'percent' ? '100' : undefined}
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  disabled={!canEdit}
                />
              </Field>
              <div className="rounded-xl border border-line bg-paper/70 px-3 py-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{formatBillMoney(preview.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Calculated Discount</span><span className="tabular-nums text-emerald-800">{preview.discountAmount ? formatBillMoney(preview.discountAmount) : 'None'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Taxable</span><span className="tabular-nums">{formatBillMoney(preview.taxable)}</span></div>
              </div>
              <Button type="submit" className="w-full bg-forest hover:bg-forest-deep" disabled={working || emptyOrders || !canEdit}>
                {working ? 'Saving...' : 'Apply Discount'}
              </Button>
            </form>
          </SectionCard>

          <SectionCard title="Tax Information">
            <form className="space-y-3" onSubmit={submitTax}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">GST Enabled</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={taxEnabled}
                  disabled={!canEdit}
                  onClick={() => setTaxEnabled((value) => !value)}
                  className={`relative h-7 w-12 rounded-full transition ${taxEnabled ? 'bg-forest' : 'bg-line'}`}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${taxEnabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              {taxEnabled ? (
                <>
                  <div className="flex gap-1.5" role="group" aria-label="Tax mode">
                    {[
                      { id: 'exclusive', label: 'Exclusive' },
                      { id: 'inclusive', label: 'Inclusive' },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setTaxMode(option.id)}
                        className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${pillClass(taxMode === option.id, 'forest')}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <Field label="Tax Rate">
                    {rates.length ? (
                      <select className={inputClass} value={taxRate} disabled={!canEdit} onChange={(event) => setTaxRate(event.target.value)}>
                        <option value="">Select rate</option>
                        {rates.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input className={inputClass} type="number" min="0" step="0.01" value={taxRate} disabled={!canEdit} onChange={(event) => setTaxRate(event.target.value)} placeholder="Restaurant tax rate" />
                    )}
                  </Field>
                </>
              ) : (
                <p className="text-sm text-muted">Tax is off. Grand total equals taxable value{preview.serviceCharge ? ' plus service charge' : ''}.</p>
              )}
              <Button type="submit" className="w-full" variant="secondary" disabled={working || emptyOrders || !canEdit}>
                {working ? 'Saving...' : 'Apply Tax'}
              </Button>
            </form>
          </SectionCard>

          <SectionCard title="Payment History">
            {billPayments.length ? (
              <ul className="space-y-3">
                {billPayments.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 text-sm">
                    <span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${methodTone(row.payment_method)}`}>
                        {paymentMethodLabel(row.payment_method)}
                      </span>
                      <span className="mt-1 block text-xs text-muted">{formatClock(row.paid_at || row.created_at)}</span>
                      {row.payment_reference ? <span className="block text-xs text-muted">{row.payment_reference}</span> : null}
                    </span>
                    <span className="tabular-nums font-medium">{formatBillMoney(row.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No payments yet</p>
            )}
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-medium">
              <span>Total Paid</span>
              <span className="tabular-nums">{formatBillMoney(balance.paid)}</span>
            </div>
          </SectionCard>
        </div>
      </div>

      {balance.remaining > 0 ? (
        <div className="sticky bottom-3 z-10 rounded-2xl border border-line bg-card/95 p-3 shadow-lg backdrop-blur xl:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Amount Due</p>
              <p className="font-display text-2xl leading-none tabular-nums">{formatBillMoney(balance.remaining)}</p>
            </div>
            <Button className="bg-forest hover:bg-forest-deep" disabled={collecting || emptyOrders} onClick={() => document.querySelector('[aria-label="Payment mode"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              Collect
            </Button>
          </div>
        </div>
      ) : null}

      {confirmSettle ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Confirm settlement</p>
            <h2 className="mt-2 font-display text-2xl">Settle this bill?</h2>
            <p className="mt-2 text-sm text-muted">
              Remaining will be ₹0. The table session will close. Orders, KOTs and payment history are kept.
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                className="bg-forest hover:bg-forest-deep"
                disabled={collecting}
                onClick={() => {
                  const payload = confirmSettle
                  setConfirmSettle(false)
                  onCollect(payload)
                }}
              >
                Settle Bill
              </Button>
              <Button variant="secondary" onClick={() => setConfirmSettle(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
