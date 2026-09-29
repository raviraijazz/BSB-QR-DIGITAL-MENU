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
} from '../../../lib/orderCart'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { tableHeading } from '../../../lib/tableToken'
import {
  ensureSessionBill,
  listRestaurantBills,
  runningBillView,
  saveBillDiscount,
  sessionWaiterFromOrders,
  waiterLabel,
} from '../../../services/bills'
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

function BillDetail({ view, working, notice, error, onClose, onRefresh, onSave }) {
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
          <h2 className="mt-1 font-display text-2xl">{view.table ? tableHeading(view.table) : 'Table'}</h2>
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
        </div>

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
              hint={preview.warning || (discountType === 'percent' ? '0 to 100' : 'Cannot exceed subtotal')}
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
              />
            </Field>
          </div>
          <p className="mt-2 text-sm text-muted">
            Calculated discount {preview.discountAmount ? formatBillMoney(preview.discountAmount) : 'None'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={working || emptyOrders}>
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
          <Button disabled={working || emptyOrders} onClick={submit}>
            {working ? 'Saving...' : 'Save Discount'}
          </Button>
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
  const [tables, setTables] = useState([])
  const [waiters, setWaiters] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(true)
  const [working, setWorking] = useState(false)
  const [filter, setFilter] = useState('all')
  const [waiterFilter, setWaiterFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const restaurantId = restaurant?.id

  async function load(silent = false) {
    if (!restaurantId) {
      setSessions([])
      setOrders([])
      setBills([])
      setTables([])
      setWaiters([])
      setBusy(false)
      return
    }
    if (!silent) setBusy(true)
    const [nextSessions, nextOrders, nextBills, nextTables, nextWaiters] = await Promise.all([
      listOpenSessions(restaurantId),
      listRestaurantOrders(restaurantId),
      listRestaurantBills(restaurantId),
      listTables(restaurantId),
      listWaiters(restaurantId),
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

  const rows = useMemo(() => {
    return (sessions || [])
      .filter((session) => isOpenSession(session))
      .map((session) => {
        const sessionOrders = ordersForSession(orders, session.id)
        const waiter = sessionWaiterFromOrders(sessionOrders, waitersById)
        const table = tableById[session.primary_table_id] || null
        return runningBillView(session, sessionOrders, billsBySession[session.id] || null, table, waiter)
      })
      .filter((row) => row.orderCount > 0)
  }, [sessions, orders, billsBySession, tableById, waitersById])

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
      if (filter === 'open' && row.status !== 'open') return false
      if (filter === 'high' && row.payable < HIGH_VALUE) return false
      if (waiterFilter && row.waiter?.id !== waiterFilter) return false
      if (tableFilter && row.table?.id !== tableFilter) return false
      if (!needle) return true
      const hay = [
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
    const outstanding = rows.reduce((sum, row) => sum + row.payable, 0)
    return [
      { id: 'open', label: 'Open Sessions', value: String(rows.length) },
      { id: 'gross', label: 'Gross Sales', value: formatBillMoney(gross) },
      { id: 'discounts', label: 'Discounts', value: formatBillMoney(discounts) },
      { id: 'net', label: 'Net Outstanding', value: formatBillMoney(outstanding) },
    ]
  }, [rows])

  const selected = useMemo(() => rows.find((row) => row.session.id === selectedId) || null, [rows, selectedId])

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
        <Button variant="secondary" onClick={() => load()}>
          Refresh
        </Button>
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
          {rows
            .filter((row) => row.table?.id)
            .filter((row, index, list) => list.findIndex((item) => item.table.id === row.table.id) === index)
            .map((row) => (
              <option key={row.table.id} value={row.table.id}>
                {tableHeading(row.table)}
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
                      <p className="truncate font-medium">{row.table ? tableHeading(row.table) : 'Table'}</p>
                      <p className="truncate text-xs text-muted">{row.session.session_number}</p>
                    </div>
                    <p className="truncate text-muted">{waiterLabel(row.waiter)}</p>
                    <p className="tabular-nums">
                      {row.orderCount}
                      <span className="block text-[11px] text-muted">{row.itemCount} items</span>
                    </p>
                    <p className="tabular-nums">{formatBillMoney(row.subtotal)}</p>
                    <p className="tabular-nums">{row.discountAmount ? formatBillMoney(row.discountAmount) : 'None'}</p>
                    <p className="font-medium tabular-nums">{formatBillMoney(row.payable)}</p>
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
                        <p className="font-display text-xl">{row.table ? tableHeading(row.table) : 'Table'}</p>
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
                        {row.discountAmount ? `Discount ${formatBillMoney(row.discountAmount)}` : 'No discount'}
                      </p>
                      <p className="font-display text-2xl leading-none">{formatBillMoney(row.payable)}</p>
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
              working={working}
              notice={notice}
              error={error}
              onClose={() => {
                setSelectedId('')
                setNotice('')
              }}
              onRefresh={() => load()}
              onSave={onSaveDiscount}
            />
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="font-display text-xl">Select a bill</p>
                <p className="mt-2 text-sm text-muted">Open a running bill to review orders and apply a discount.</p>
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
            onClick={() => {
              setSelectedId('')
              setNotice('')
            }}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-line bg-card p-5 shadow-lg">
            <BillDetail
              view={selected}
              working={working}
              notice={notice}
              error={error}
              onClose={() => {
                setSelectedId('')
                setNotice('')
              }}
              onRefresh={() => load()}
              onSave={onSaveDiscount}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
