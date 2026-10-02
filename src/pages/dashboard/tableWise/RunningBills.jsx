import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import Field, { inputClass } from '../../../components/Field'
import NavIcon from '../../../components/NavIcon'
import Spinner from '../../../components/Spinner'
import {
  applyBillDiscount,
  billStatusLabel,
  elapsedLabel,
  firstRelated,
  formatBillMoney,
  formatClock,
  formatQty,
  isOpenSession,
  moneyRound,
  newPaymentRequestId,
  PAYMENT_METHODS,
  paymentMethodLabel,
} from '../../../lib/orderCart'
import { MergeTablesDialog, TransferTableDialog } from '../../../components/TableMoveDialogs'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { sessionTablesLabel, tableHeading } from '../../../lib/tableToken'
import {
  ensureSessionBill,
  listRestaurantBills,
  runningBillView,
  saveBillDiscount,
  sessionWaiterFromOrders,
  waiterLabel,
} from '../../../services/bills'
import { collectBillPayment, listRestaurantPayments, paymentBalance } from '../../../services/payments'
import { mergeTableSessions, tablesForSession, transferTableSession } from '../../../services/tableMoves'
import { listTables } from '../../../services/tables'
import { listOpenSessions } from '../../../services/tableSessions'
import { listRestaurantOrders, orderSubtotal } from '../../../services/waiterOrders'
import { listWaiters } from '../../../services/waiters'

const HIGH_VALUE = 1000

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'high', label: 'High Value' },
]

function ordersForSession(orders, sessionId) {
  return (orders || []).filter((order) => order.session_id === sessionId && order.status !== 'cancelled')
}

function PaymentHistory({ payments, payable }) {
  const rows = payments || []
  const balance = paymentBalance(payable, rows)
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Payment history</p>
        <p className="mt-2 text-muted">No payments yet</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Payment history</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3">
            <span>
              <span className="font-medium">{paymentMethodLabel(row.payment_method)}</span>
              {row.payment_reference ? <span className="mt-0.5 block text-xs text-muted">{row.payment_reference}</span> : null}
              <span className="mt-0.5 block text-xs text-muted">{formatClock(row.paid_at || row.created_at)}</span>
            </span>
            <span className="shrink-0 tabular-nums">{formatBillMoney(row.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between border-t border-line pt-3 font-medium">
        <span>Total paid</span>
        <span className="tabular-nums">{formatBillMoney(balance.paid)}</span>
      </div>
      <div className="mt-1 flex justify-between text-muted">
        <span>Remaining</span>
        <span className="tabular-nums">{formatBillMoney(balance.remaining)}</span>
      </div>
    </div>
  )
}

function CollectPaymentForm({ remaining, working, error, onCancel, onSubmit }) {
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState(remaining ? String(remaining) : '')
  const [reference, setReference] = useState('')

  useEffect(() => {
    setAmount(remaining ? String(remaining) : '')
  }, [remaining])

  function submit(event) {
    event.preventDefault()
    const numeric = moneyRound(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      onSubmit({ error: 'Enter a payment amount.' })
      return
    }
    if (numeric > remaining + 0.001) {
      onSubmit({ error: 'Payment cannot exceed remaining balance.' })
      return
    }
    onSubmit({
      method,
      amount: numeric,
      reference: method === 'cash' ? '' : String(reference || '').trim(),
    })
  }

  return (
    <form className="rounded-2xl border border-line bg-white px-4 py-3" onSubmit={submit}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Collect payment</p>
      <p className="mt-2 font-display text-3xl tabular-nums leading-none">{formatBillMoney(remaining)}</p>
      <p className="mt-1 text-xs text-muted">Amount due</p>
      <div className="mt-3 flex gap-1.5" role="group" aria-label="Payment method">
        {PAYMENT_METHODS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMethod(option.id)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
              method === option.id ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Field label="Amount">
          <input
            className={inputClass}
            type="number"
            min="0.01"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      </div>
      {method !== 'cash' ? (
        <div className="mt-3">
          <Field label="Reference / Transaction ID" hint="Optional">
            <input
              className={inputClass}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={method === 'upi' ? 'UPI ref' : 'Card ref'}
            />
          </Field>
        </div>
      ) : null}
      <Alert>{error}</Alert>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={working || remaining <= 0}>
          {working ? 'Recording...' : 'Add Payment'}
        </Button>
        <Button type="button" variant="secondary" disabled={working} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function BillDetail({ view, payments, working, collecting, notice, error, payError, onClose, onRefresh, onSave, onCollect, onStartPay, onCancelPay, paying }) {
  const [discountType, setDiscountType] = useState(view.discountType || 'percent')
  const [discountValue, setDiscountValue] = useState(view.discountValue ? String(view.discountValue) : '')

  useEffect(() => {
    setDiscountType(view.discountType || 'percent')
    setDiscountValue(view.discountValue ? String(view.discountValue) : '')
  }, [view.session?.id])

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const preview = applyBillDiscount(view.subtotal, discountType, discountValue)
  const waiter = waiterLabel(view.waiter)
  const emptyOrders = view.orderCount === 0
  const billPayments = payments || []
  const balance = paymentBalance(preview.payable, billPayments)
  const hasPayments = billPayments.length > 0
  const canDiscount = !hasPayments && view.status === 'open'

  function submit(event) {
    event?.preventDefault?.()
    const raw = String(discountValue || '').trim()
    if (raw === '') {
      onSave(null, 0)
      return
    }
    const numeric = Number(raw)
    if (!Number.isFinite(numeric) || numeric < 0) {
      onSave(discountType, -1)
      return
    }
    onSave(discountType, numeric)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Running bill</p>
          <h2 className="mt-1 font-display text-2xl">
            {view.sessionTables?.length
              ? sessionTablesLabel(view.sessionTables, { compact: true })
              : view.table
                ? tableHeading(view.table)
                : 'Table'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {view.session?.session_number || 'Session'}
            {view.bill?.bill_number ? ` · ${view.bill.bill_number}` : ''}
          </p>
          <p className="text-sm text-muted">
            {waiter} · Started {formatClock(view.session?.started_at)}
            {elapsedLabel(view.session?.started_at) ? ` · ${elapsedLabel(view.session?.started_at)}` : ''}
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-muted">{billStatusLabel(view.status)}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-line">
          <NavIcon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <Alert>{error}</Alert>
        <Alert type="success">{notice}</Alert>

        {emptyOrders ? (
          <EmptyState title="Waiting for first order" body="This table session is open. The running bill appears after the first order is placed." />
        ) : (
          <div className="space-y-3">
            {view.orders.map((order) => {
              const items = order.order_items || []
              const orderWaiter = waiterLabel(firstRelated(order.waiters) || view.waiter)
              return (
                <section key={order.id} className="rounded-2xl border border-line bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg">Order #{order.order_number}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatClock(order.created_at)} · {orderWaiter}
                      </p>
                    </div>
                    <p className="font-medium">{formatBillMoney(orderSubtotal(items))}</p>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          {item.item_name} ×{formatQty(item.quantity)}
                          {item.notes ? <span className="mt-0.5 block text-xs text-muted">{item.notes}</span> : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">{formatBillMoney(item.line_total)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex justify-between text-sm font-medium">
                    <span>Order subtotal</span>
                    <span>{formatBillMoney(orderSubtotal(items))}</span>
                  </p>
                </section>
              )
            })}
          </div>
        )}

        <div className="rounded-2xl border border-line bg-paper/80 px-4 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted">Subtotal</span>
            <span className="tabular-nums">{formatBillMoney(view.subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-muted">Discount</span>
            <span className="tabular-nums">
              {preview.discountAmount ? `-${formatBillMoney(preview.discountAmount)}` : 'None'}
            </span>
          </div>
          <div className="mt-3 flex justify-between gap-3 border-t border-line pt-3 font-display text-xl">
            <span>Payable</span>
            <span className="tabular-nums">{formatBillMoney(preview.payable)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-3 text-sm">
            <span className="text-muted">Paid</span>
            <span className="tabular-nums">{formatBillMoney(balance.paid)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-3 text-sm font-medium">
            <span>Remaining</span>
            <span className="tabular-nums">{formatBillMoney(balance.remaining)}</span>
          </div>
        </div>

        <PaymentHistory payments={billPayments} payable={preview.payable} />

        {paying ? (
          <CollectPaymentForm
            remaining={balance.remaining}
            working={collecting}
            error={payError}
            onCancel={onCancelPay}
            onSubmit={onCollect}
          />
        ) : balance.remaining > 0 ? (
          <Button className="w-full" disabled={working || emptyOrders} onClick={onStartPay}>
            {hasPayments ? 'Add Another Payment' : 'Collect Payment'}
          </Button>
        ) : view.status !== 'paid' ? (
          <Button className="w-full" disabled={working || collecting} onClick={() => onCollect({ settle: true })}>
            {collecting ? 'Settling...' : 'Settle Bill'}
          </Button>
        ) : (
          <p className="rounded-xl bg-forest/10 px-3 py-2 text-center text-sm font-medium text-forest">Bill settled</p>
        )}

        <form className="rounded-2xl border border-line bg-white px-4 py-3" onSubmit={submit}>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Discount</p>
          <div className="mt-3 flex gap-1.5" role="group" aria-label="Discount type">
            {[
              { id: 'percent', label: 'Percentage' },
              { id: 'amount', label: 'Amount' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={!canDiscount}
                onClick={() => setDiscountType(option.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                  discountType === option.id ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Field
              label={discountType === 'amount' ? 'Discount amount' : 'Discount percent'}
              hint={
                canDiscount
                  ? preview.warning || (discountType === 'percent' ? '0 to 100' : 'Cannot exceed subtotal')
                  : 'Discount cannot change after a payment is recorded.'
              }
              error=""
            >
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                max={discountType === 'percent' ? '100' : undefined}
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                placeholder={discountType === 'percent' ? '10' : '200'}
                disabled={!canDiscount}
              />
            </Field>
          </div>
          <p className="mt-2 text-sm text-muted">
            Calculated discount {preview.discountAmount ? formatBillMoney(preview.discountAmount) : 'None'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={working || emptyOrders || !canDiscount}>
              {working ? 'Saving...' : 'Save Discount'}
            </Button>
            <Button type="button" variant="secondary" disabled={working} onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        </form>
      </div>

      <div className="sticky bottom-0 mt-4 border-t border-line bg-card pt-3 lg:hidden">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Payable</p>
            <p className="font-display text-2xl leading-none">{formatBillMoney(preview.payable)}</p>
          </div>
          {balance.remaining > 0 && !paying ? (
            <Button disabled={working || emptyOrders} onClick={onStartPay}>
              {hasPayments ? 'Add Payment' : 'Collect Payment'}
            </Button>
          ) : (
            <Button disabled={working || emptyOrders || !canDiscount} onClick={submit}>
              {working ? 'Saving...' : 'Save Discount'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RunningBills() {
  const { restaurant, loading } = useOutletContext()
  const [sessions, setSessions] = useState([])
  const [orders, setOrders] = useState([])
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [tables, setTables] = useState([])
  const [waiters, setWaiters] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [payError, setPayError] = useState('')
  const [busy, setBusy] = useState(true)
  const [working, setWorking] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(null)
  const [filter, setFilter] = useState('all')
  const [waiterFilter, setWaiterFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [moveMode, setMoveMode] = useState('')
  const [moveTableId, setMoveTableId] = useState('')
  const [moveBusy, setMoveBusy] = useState(false)

  const restaurantId = restaurant?.id

  async function load(silent = false) {
    if (!restaurantId) {
      setSessions([])
      setOrders([])
      setBills([])
      setPayments([])
      setTables([])
      setWaiters([])
      setBusy(false)
      return
    }
    if (!silent) setBusy(true)
    const [nextSessions, nextOrders, nextBills, nextTables, nextWaiters, nextPayments] = await Promise.all([
      listOpenSessions(restaurantId),
      listRestaurantOrders(restaurantId),
      listRestaurantBills(restaurantId),
      listTables(restaurantId),
      listWaiters(restaurantId),
      listRestaurantPayments(restaurantId),
    ])
    const openSessions = nextSessions.data ?? []
    const allOrders = nextOrders.data ?? []
    let nextBillRows = nextBills.data ?? []
    let loadError =
      nextSessions.error?.message ||
      nextOrders.error?.message ||
      nextBills.error?.message ||
      nextTables.error?.message ||
      nextWaiters.error?.message ||
      nextPayments.error?.message ||
      ''

    if (!loadError) {
      for (const session of openSessions) {
        const sessionOrders = ordersForSession(allOrders, session.id)
        if (!sessionOrders.length) continue
        const { data, error: syncError } = await ensureSessionBill(restaurantId, session, sessionOrders, nextBillRows)
        if (syncError && !data) {
          loadError = syncError.message
          break
        }
        if (data) {
          nextBillRows = nextBillRows.filter((row) => row.session_id !== session.id).concat(data)
        }
      }
    }

    setSessions(openSessions)
    setOrders(allOrders)
    setBills(nextBillRows)
    setPayments(nextPayments.data ?? [])
    setTables(nextTables.data ?? [])
    setWaiters(nextWaiters.data ?? [])
    if (loadError) setError(loadError)
    else if (!silent) setError('')
    setBusy(false)
  }

  useEffect(() => {
    load()
    if (!restaurantId) return undefined
    const timer = window.setInterval(() => load(true), 8000)
    return () => window.clearInterval(timer)
  }, [restaurantId])

  const tableById = useMemo(() => Object.fromEntries((tables || []).map((table) => [table.id, table])), [tables])
  const waitersById = useMemo(() => Object.fromEntries((waiters || []).map((waiter) => [waiter.id, waiter])), [waiters])
  const billsBySession = useMemo(() => Object.fromEntries((bills || []).map((bill) => [bill.session_id, bill])), [bills])
  const paymentsByBill = useMemo(() => {
    const map = {}
    for (const row of payments || []) {
      if (!row?.bill_id) continue
      if (!map[row.bill_id]) map[row.bill_id] = []
      map[row.bill_id].push(row)
    }
    return map
  }, [payments])

  const rows = useMemo(() => {
    return (sessions || [])
      .filter((session) => isOpenSession(session))
      .map((session) => {
        const sessionOrders = ordersForSession(orders, session.id)
        const waiter = sessionWaiterFromOrders(sessionOrders, waitersById)
        const sessionTables = tablesForSession(tables, session)
        const table = sessionTables[0] || tableById[session.primary_table_id] || null
        const view = runningBillView(session, sessionOrders, billsBySession[session.id] || null, table, waiter)
        const billPayments = view.bill?.id ? paymentsByBill[view.bill.id] || [] : []
        const balance = paymentBalance(view.payable, billPayments)
        return { ...view, sessionTables, payments: billPayments, paid: balance.paid, remaining: balance.remaining }
      })
      .filter((row) => row.orderCount > 0)
  }, [sessions, orders, billsBySession, tableById, waitersById, paymentsByBill])

  const waiterOptions = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      if (row.waiter?.id && !map.has(row.waiter.id)) map.set(row.waiter.id, row.waiter)
    }
    return [...map.values()]
  }, [rows])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter === 'open' && row.status === 'paid') return false
      if (filter === 'high' && row.remaining < HIGH_VALUE) return false
      if (waiterFilter && row.waiter?.id !== waiterFilter) return false
      if (tableFilter && !(row.sessionTables || []).some((table) => table.id === tableFilter) && row.table?.id !== tableFilter) return false
      if (!needle) return true
      const hay = [
        sessionTablesLabel(row.sessionTables || [row.table].filter(Boolean)),
        tableHeading(row.table),
        row.session?.session_number,
        row.bill?.bill_number,
        row.waiter?.full_name,
        row.waiter?.waiter_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [rows, filter, waiterFilter, tableFilter, query])

  const metrics = useMemo(() => {
    const gross = rows.reduce((sum, row) => sum + row.subtotal, 0)
    const discounts = rows.reduce((sum, row) => sum + row.discountAmount, 0)
    const outstanding = rows.reduce((sum, row) => sum + row.remaining, 0)
    return [
      { id: 'open', label: 'Open Sessions', value: String(rows.length) },
      { id: 'gross', label: 'Gross Sales', value: formatBillMoney(gross) },
      { id: 'discounts', label: 'Discounts', value: formatBillMoney(discounts) },
      { id: 'net', label: 'Net Outstanding', value: formatBillMoney(outstanding) },
    ]
  }, [rows])

  const selected = useMemo(() => rows.find((row) => row.session.id === selectedId) || null, [rows, selectedId])

  function closeBill() {
    setSelectedId('')
    setNotice('')
    setPayError('')
    setPaying(false)
    setSuccess(null)
  }

  async function onCollectPayment(payload) {
    if (!selected || !restaurantId) return
    if (payload?.error) {
      setPayError(payload.error)
      return
    }
    setCollecting(true)
    setPayError('')
    setError('')
    let bill = selected.bill
    if (!bill) {
      const created = await ensureSessionBill(restaurantId, selected.session, selected.orders, bills)
      if (created.error || !created.data) {
        setCollecting(false)
        setPayError(created.error?.message || 'Unable to open this running bill. Please try again.')
        return
      }
      bill = created.data
      setBills((current) => current.filter((row) => row.session_id !== bill.session_id).concat(bill))
    }
    const { data, error: collectError } = await collectBillPayment({
      restaurantId,
      billId: bill.id,
      amount: payload.settle ? 0 : payload.amount,
      method: payload.settle ? 'cash' : payload.method,
      reference: payload.settle ? '' : payload.reference,
      requestId: payload.settle ? null : newPaymentRequestId(),
    })
    setCollecting(false)
    if (collectError || !data) {
      setPayError(collectError?.message || 'Unable to record payment. Please try again.')
      load(true)
      return
    }
    if (data.bill) {
      setBills((current) => current.map((row) => (row.id === data.bill.id ? { ...row, ...data.bill } : row)))
    }
    if (data.payment?.id) {
      setPayments((current) => {
        if (current.some((row) => row.id === data.payment.id)) return current
        return [...current, data.payment]
      })
    }
    setPaying(false)
    if (data.settled) {
      const methodRows = (selected.payments || []).concat(data.payment?.id ? [data.payment] : [])
      setSuccess({
        table: selected.table,
        session: selected.session,
        payable: selected.payable,
        payments: methodRows,
      })
      setSelectedId('')
      load(true)
      return
    }
    setNotice('Payment recorded.')
    load(true)
  }

  async function onSaveDiscount(discountType, discountValue) {
    if (!selected || !restaurantId) return
    if (discountValue < 0) {
      setNotice('')
      setError('Enter a valid discount of 0 or more.')
      return
    }
    setWorking(true)
    setError('')
    setNotice('')
    const preview = applyBillDiscount(selected.subtotal, discountType, discountValue)
    let bill = selected.bill
    if (!bill) {
      const created = await ensureSessionBill(restaurantId, selected.session, selected.orders, bills)
      if (created.error || !created.data) {
        setWorking(false)
        setError(created.error?.message || 'Unable to open this running bill. Please try again.')
        return
      }
      bill = created.data
      setBills((current) => current.filter((row) => row.session_id !== bill.session_id).concat(bill))
    }
    const { data, error: saveError } = await saveBillDiscount(
      restaurantId,
      bill,
      selected.subtotal,
      preview.discountType,
      preview.discountValue,
    )
    setWorking(false)
    if (saveError || !data) {
      setError(saveError?.message || 'Unable to save discount. Please try again.')
      return
    }
    setBills((current) => current.map((row) => (row.id === data.id ? data : row)))
    setNotice(preview.warning || 'Discount saved.')
  }

  if (loading || busy) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Running bills are scoped to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  const empty = !rows.length
  const noMatch = !empty && !visible.length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Running Bills</h1>
          <p className="mt-1 text-sm text-muted">{restaurant.name} · one open bill per active session</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setMoveTableId(selected?.table?.id || ''); setMoveMode('merge') }}>
            Merge Tables
          </Button>
          <Button variant="secondary" onClick={() => { setMoveTableId(selected?.table?.id || ''); setMoveMode('transfer') }}>
            Transfer Table
          </Button>
          <Button variant="secondary" onClick={() => load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.id} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{metric.label}</p>
            <p className="mt-1 font-display text-2xl leading-none tabular-nums">{metric.value}</p>
          </div>
        ))}
      </div>

      <Alert>{error && !selected ? error : ''}</Alert>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter bills">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
                filter === option.id ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          className={`${inputClass} lg:max-w-[12rem]`}
          value={waiterFilter}
          onChange={(event) => setWaiterFilter(event.target.value)}
          aria-label="By waiter"
        >
          <option value="">By Waiter</option>
          {waiterOptions.map((waiter) => (
            <option key={waiter.id} value={waiter.id}>
              {waiter.full_name || waiter.waiter_id}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} lg:max-w-[12rem]`}
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
          aria-label="By table"
        >
          <option value="">By Table</option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {tableHeading(table)}
            </option>
          ))}
        </select>
        <input
          className={`${inputClass} lg:max-w-xs`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search table, session or waiter"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.9fr)]">
        <div className="min-w-0">
          {empty ? (
            <EmptyState title="All tables are settled" body="Running bills appear here after a waiter places an order on an active table session." />
          ) : noMatch ? (
            <EmptyState title="No matching bills" body="Try another filter or clear the search." />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-line bg-card md:block">
                <div className="grid grid-cols-[1.2fr_1fr_0.6fr_0.8fr_0.8fr_0.9fr_0.8fr_5.5rem] gap-2 border-b border-line bg-paper px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  <span>Table</span>
                  <span>Waiter</span>
                  <span>Orders</span>
                  <span>Subtotal</span>
                  <span>Discount</span>
                  <span>Payable</span>
                  <span>Started</span>
                  <span />
                </div>
                {visible.map((row) => (
                  <div
                    key={row.session.id}
                    className={`grid grid-cols-[1.2fr_1fr_0.6fr_0.8fr_0.8fr_0.9fr_0.8fr_5.5rem] items-center gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0 ${
                      selectedId === row.session.id ? 'bg-forest/5' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {row.sessionTables?.length
                          ? sessionTablesLabel(row.sessionTables, { compact: true })
                          : row.table
                            ? tableHeading(row.table)
                            : 'Table'}
                      </p>
                      <p className="truncate text-xs text-muted">{row.session.session_number}</p>
                    </div>
                    <p className="truncate text-muted">{waiterLabel(row.waiter)}</p>
                    <p className="tabular-nums">
                      {row.orderCount}
                      <span className="block text-[11px] text-muted">{row.itemCount} items</span>
                    </p>
                    <p className="tabular-nums">{formatBillMoney(row.subtotal)}</p>
                    <p className="tabular-nums">{row.discountAmount ? formatBillMoney(row.discountAmount) : 'None'}</p>
                    <p className="font-medium tabular-nums">
                      {formatBillMoney(row.remaining)}
                      {row.paid ? <span className="block text-[11px] font-normal text-muted">paid {formatBillMoney(row.paid)}</span> : null}
                    </p>
                    <p className="text-xs text-muted">{formatClock(row.session.started_at)}</p>
                    <Button
                      variant="secondary"
                      className="h-9 px-3 py-0 text-[13px]"
                      onClick={() => setSelectedId(row.session.id)}
                    >
                      View Bill
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 md:hidden">
                {visible.map((row) => (
                  <button
                    key={row.session.id}
                    type="button"
                    onClick={() => setSelectedId(row.session.id)}
                    className="w-full rounded-2xl border border-line bg-card p-4 text-left shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-xl">
                          {row.sessionTables?.length
                            ? sessionTablesLabel(row.sessionTables, { compact: true })
                            : row.table
                              ? tableHeading(row.table)
                              : 'Table'}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {row.session.session_number} · {waiterLabel(row.waiter)}
                        </p>
                      </div>
                      <span className="rounded-full bg-forest/10 px-2.5 py-0.5 text-[11px] font-medium text-forest">
                        {billStatusLabel(row.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {row.orderCount} {row.orderCount === 1 ? 'order' : 'orders'} · {row.itemCount} items · {formatClock(row.session.started_at)}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p className="text-sm text-muted">
                        {row.paid ? `Paid ${formatBillMoney(row.paid)}` : row.discountAmount ? `Discount ${formatBillMoney(row.discountAmount)}` : 'No discount'}
                      </p>
                      <p className="font-display text-2xl leading-none">{formatBillMoney(row.remaining)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="hidden min-h-[32rem] rounded-2xl border border-line bg-card p-5 xl:block">
          {selected ? (
            <BillDetail
              view={selected}
              payments={selected.payments}
              working={working}
              collecting={collecting}
              paying={paying}
              notice={notice}
              error={error}
              payError={payError}
              onClose={closeBill}
              onRefresh={() => load()}
              onSave={onSaveDiscount}
              onCollect={onCollectPayment}
              onStartPay={() => {
                setPaying(true)
                setPayError('')
              }}
              onCancelPay={() => {
                setPaying(false)
                setPayError('')
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="font-display text-xl">Select a bill</p>
                <p className="mt-2 text-sm text-muted">Open a running bill to review orders, apply a discount, and collect payment.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/40 xl:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close bill"
            onClick={closeBill}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-line bg-card p-5 shadow-lg">
            <BillDetail
              view={selected}
              payments={selected.payments}
              working={working}
              collecting={collecting}
              paying={paying}
              notice={notice}
              error={error}
              payError={payError}
              onClose={closeBill}
              onRefresh={() => load()}
              onSave={onSaveDiscount}
              onCollect={onCollectPayment}
              onStartPay={() => {
                setPaying(true)
                setPayError('')
              }}
              onCancelPay={() => {
                setPaying(false)
                setPayError('')
              }}
            />
          </div>
        </div>
      ) : null}

      <MergeTablesDialog
        open={moveMode === 'merge'}
        restaurantId={restaurantId}
        tables={tables}
        sessions={sessions}
        orders={orders}
        startTableId={moveTableId}
        busy={moveBusy}
        onClose={() => {
          if (moveBusy) return
          setMoveMode('')
        }}
        onConfirm={async (payload) => {
          if (moveBusy) return
          setMoveBusy(true)
          setError('')
          const { data, error: nextError } = await mergeTableSessions({ restaurantId, ...payload })
          setMoveBusy(false)
          if (nextError || !data) {
            setError(nextError?.message || 'Unable to merge these tables. Please try again.')
            return
          }
          setMoveMode('')
          setNotice('Tables merged into one session.')
          load()
        }}
      />
      <TransferTableDialog
        open={moveMode === 'transfer'}
        restaurantId={restaurantId}
        tables={tables}
        sessions={sessions}
        orders={orders}
        startTableId={moveTableId}
        busy={moveBusy}
        onClose={() => {
          if (moveBusy) return
          setMoveMode('')
        }}
        onConfirm={async (payload) => {
          if (moveBusy) return
          setMoveBusy(true)
          setError('')
          const { data, error: nextError } = await transferTableSession({ restaurantId, ...payload })
          setMoveBusy(false)
          if (nextError || !data) {
            setError(nextError?.message || 'Unable to transfer this table. Please try again.')
            return
          }
          setMoveMode('')
          setNotice('Session transferred. The original session ID is unchanged.')
          load()
        }}
      />

      {success ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-lg">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-forest">Payment successful</p>
            <h2 className="mt-2 font-display text-3xl">{formatBillMoney(success.payable)}</h2>
            <p className="mt-1 text-sm text-muted">
              {success.table ? tableHeading(success.table) : 'Table'}
              {success.session?.session_number ? ` · ${success.session.session_number}` : ''}
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {(success.payments || []).map((row) => (
                <li key={row.id || `${row.payment_method}-${row.amount}`} className="flex justify-between gap-3">
                  <span>{paymentMethodLabel(row.payment_method)}</span>
                  <span className="tabular-nums">{formatBillMoney(row.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-forest/10 px-3 py-2 text-center text-sm font-medium text-forest">Session closed · table available</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/dashboard/table-wise/tables">
                <Button>Floor / Tables</Button>
              </Link>
              <Button variant="secondary" onClick={() => setSuccess(null)}>
                Running Bills
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
