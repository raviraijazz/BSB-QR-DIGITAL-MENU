import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import { inputClass } from '../../../components/Field'
import Spinner from '../../../components/Spinner'
import BillWorkspace from '../../../components/bills/BillWorkspace'
import { calculateBill } from '../../../lib/billing'
import {
  billStatusLabel,
  formatBillMoney,
  formatClock,
  isOpenSession,
  moneyRound,
  newPaymentRequestId,
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
import { listRestaurantOrders } from '../../../services/waiterOrders'
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
        const { data, error: syncError } = await ensureSessionBill(restaurantId, session, sessionOrders, nextBillRows, restaurant)
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
        const view = runningBillView(session, sessionOrders, billsBySession[session.id] || null, table, waiter, restaurant)
        const billPayments = view.bill?.id ? paymentsByBill[view.bill.id] || [] : []
        const balance = paymentBalance(view.payable, billPayments)
        return { ...view, sessionTables, payments: billPayments, paid: balance.paid, remaining: balance.remaining }
      })
      .filter((row) => row.orderCount > 0)
  }, [sessions, orders, billsBySession, tableById, waitersById, paymentsByBill, restaurant, tables])

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
    setSuccess(null)
  }

  async function recordPayment(bill, payload) {
    return collectBillPayment({
      restaurantId,
      billId: bill.id,
      amount: payload.amount,
      method: payload.method,
      reference: payload.reference,
      requestId: newPaymentRequestId(),
    })
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
      const created = await ensureSessionBill(restaurantId, selected.session, selected.orders, bills, restaurant)
      if (created.error || !created.data) {
        setCollecting(false)
        setPayError(created.error?.message || 'Unable to open this running bill. Please try again.')
        return
      }
      bill = created.data
      setBills((current) => current.filter((row) => row.session_id !== bill.session_id).concat(bill))
    }

    const queue = payload.splits?.length ? payload.splits : [payload]
    const recorded = [...(selected.payments || [])]
    let settled = false
    let lastBill = bill
    let remaining = selected.remaining

    for (const item of queue) {
      const amount = moneyRound(item.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        setCollecting(false)
        setPayError('Enter a payment amount.')
        return
      }
      if (amount > remaining + 0.001) {
        setCollecting(false)
        setPayError('Payment cannot exceed the remaining balance.')
        load(true)
        return
      }
      const { data, error: collectError } = await recordPayment(lastBill, item)
      if (collectError || !data) {
        setCollecting(false)
        setPayError(collectError?.message || 'Unable to record payment. Please try again.')
        load(true)
        return
      }
      if (data.bill) {
        lastBill = data.bill
        setBills((current) => current.map((row) => (row.id === data.bill.id ? { ...row, ...data.bill } : row)))
      }
      if (data.payment?.id) {
        recorded.push(data.payment)
        setPayments((current) => {
          if (current.some((row) => row.id === data.payment.id)) return current
          return [...current, data.payment]
        })
      }
      remaining = moneyRound(data.remaining)
      settled = Boolean(data.settled)
    }

    setCollecting(false)
    if (settled) {
      setSuccess({
        table: selected.table,
        sessionTables: selected.sessionTables,
        session: selected.session,
        payable: selected.payable,
        payments: recorded,
      })
      setSelectedId('')
      load(true)
      return
    }
    setNotice(queue.length > 1 ? 'Split payments recorded.' : 'Payment recorded.')
    load(true)
  }

  async function onSaveDiscount(discountType, discountValue, tax) {
    if (!selected || !restaurantId) return
    if (discountValue < 0) {
      setNotice('')
      setError('Enter a valid discount of 0 or more.')
      return
    }
    setWorking(true)
    setError('')
    setNotice('')
    const preview = calculateBill({
      subtotal: selected.subtotal,
      discountType,
      discountValue,
      tax,
    })
    let bill = selected.bill
    if (!bill) {
      const created = await ensureSessionBill(restaurantId, selected.session, selected.orders, bills, restaurant)
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
      tax,
    )
    setWorking(false)
    if (saveError || !data) {
      setError(saveError?.message || 'Unable to save discount. Please try again.')
      return
    }
    setBills((current) => current.map((row) => (row.id === data.id ? data : row)))
    setNotice(preview.warning || 'Bill updated.')
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

  const dialogs = (
    <>
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
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-forest">Payment Successful</p>
            <h2 className="mt-2 font-display text-3xl">{formatBillMoney(success.payable)}</h2>
            <p className="mt-1 text-sm text-muted">
              {success.sessionTables?.length ? sessionTablesLabel(success.sessionTables, { compact: true }) : success.table ? tableHeading(success.table) : 'Table'}
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
            <p className="mt-4 rounded-xl bg-forest/10 px-3 py-2 text-center text-sm font-medium text-forest">Table Session Closed</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/dashboard/table-wise/tables">
                <Button className="bg-forest hover:bg-forest-deep">Floor / Tables</Button>
              </Link>
              <Button variant="secondary" onClick={() => setSuccess(null)}>
                Running Bills
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )

  if (selected) {
    return (
      <div className="mx-auto max-w-[90rem]">
        <BillWorkspace
          view={selected}
          restaurant={restaurant}
          payments={selected.payments}
          working={working}
          collecting={collecting}
          notice={notice}
          error={error}
          payError={payError}
          onBack={closeBill}
          onRefresh={() => load()}
          onSave={onSaveDiscount}
          onCollect={onCollectPayment}
          onMerge={() => {
            setMoveTableId(selected.table?.id || selected.sessionTables?.[0]?.id || '')
            setMoveMode('merge')
          }}
          onTransfer={() => {
            setMoveTableId(selected.table?.id || selected.sessionTables?.[0]?.id || '')
            setMoveMode('transfer')
          }}
        />
        {dialogs}
      </div>
    )
  }

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
          <Button variant="secondary" className="rounded-xl shadow-sm" onClick={() => { setMoveTableId(''); setMoveMode('merge') }}>
            Merge Tables
          </Button>
          <Button variant="secondary" className="rounded-xl shadow-sm" onClick={() => { setMoveTableId(''); setMoveMode('transfer') }}>
            Transfer Table
          </Button>
          <Button variant="secondary" className="rounded-xl shadow-sm" onClick={() => load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.id} className="rounded-2xl border border-line bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{metric.label}</p>
            <p className="mt-1 font-display text-2xl leading-none tabular-nums">{metric.value}</p>
          </div>
        ))}
      </div>

      <Alert>{error}</Alert>
      {notice ? <Alert type="info">{notice}</Alert> : null}

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

      {empty ? (
        <EmptyState title="All tables are settled" body="Running bills appear here after a waiter places an order on an active table session." />
      ) : noMatch ? (
        <EmptyState title="No matching bills" body="Try another filter or clear the search." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-card shadow-sm md:block">
            <div className="grid grid-cols-[1.2fr_1fr_0.6fr_0.8fr_0.8fr_0.9fr_0.8fr_5.5rem] gap-2 border-b border-line bg-paper px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <span>Table</span>
              <span>Waiter</span>
              <span>Orders</span>
              <span>Subtotal</span>
              <span>Discount</span>
              <span>Due</span>
              <span>Started</span>
              <span />
            </div>
            {visible.map((row) => (
              <div
                key={row.session.id}
                className="grid grid-cols-[1.2fr_1fr_0.6fr_0.8fr_0.8fr_0.9fr_0.8fr_5.5rem] items-center gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0"
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
                  Open
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

      {dialogs}
    </div>
  )
}
