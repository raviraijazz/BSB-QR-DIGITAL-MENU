import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import { inputClass } from '../../../components/Field'
import Spinner from '../../../components/Spinner'
import OrderHistoryDrawer from '../../../components/history/OrderHistoryDrawer'
import { downloadCsv } from '../../../lib/csv'
import {
  BILL_STATUS_OPTIONS,
  HISTORY_EXPORT_LIMIT,
  HISTORY_PAGE_SIZE,
  HISTORY_RANGE_PRESETS,
  KOT_STATUS_OPTIONS,
  ORDER_STATUS_OPTIONS,
  ORDER_TYPE_OPTIONS,
  PAYMENT_STATE_OPTIONS,
  QUICK_FILTERS,
  buildHistoryRow,
  emptyHistoryFilters,
  historyRange,
  historyStatusLabel,
  matchesQuickFilter,
  paymentStateLabel,
  statusTone,
  waiterSummary,
} from '../../../lib/orderHistory'
import { billStatusLabel, formatBillMoney, formatQty, kotStatusLabel, orderStatusLabel, PAYMENT_METHODS, paymentMethodLabel } from '../../../lib/orderCart'
import { addDays, formatReportDate, formatReportTime, localDateKey, rangeLabel } from '../../../lib/reportDates'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { tableHeading } from '../../../lib/tableToken'
import { downloadXlsx } from '../../../lib/xlsx'
import { waiterLabel } from '../../../services/bills'
import { exportOrderHistory, listHistorySessions, listOrderHistory } from '../../../services/orderHistory'
import { listTables } from '../../../services/tables'
import { listWaiters } from '../../../services/waiters'

function Badge({ status, label }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(status)}`}>{label}</span>
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-paper" />
      ))}
    </div>
  )
}

function exportColumns() {
  return [
    { label: 'Order #', value: (row) => row.order.order_number },
    { label: 'Date', value: (row) => formatReportDate(row.order.created_at) },
    { label: 'Time', value: (row) => formatReportTime(row.order.created_at) },
    { label: 'Table', value: (row) => row.tableLabel },
    { label: 'Waiter', value: (row) => waiterLabel(row.waiter) },
    { label: 'Order Type', value: (row) => row.orderType },
    { label: 'Items', value: (row) => formatQty(row.itemCount) },
    { label: 'Subtotal', value: (row) => row.subtotal },
    { label: 'KOT', value: (row) => (row.kot ? `#${row.kot.kot_number}` : '') },
    { label: 'Bill', value: (row) => row.bill?.bill_number || '' },
    { label: 'Payment', value: (row) => paymentStateLabel(row.paymentState) },
    { label: 'Status', value: (row) => historyStatusLabel(row.status) },
  ]
}

export default function OrderHistory() {
  const { restaurant, loading } = useOutletContext()
  const restaurantId = restaurant?.id
  const [filters, setFilters] = useState(emptyHistoryFilters)
  const [customFrom, setCustomFrom] = useState(localDateKey(new Date()))
  const [customTo, setCustomTo] = useState(localDateKey(new Date()))
  const [page, setPage] = useState(0)
  const [orders, setOrders] = useState([])
  const [count, setCount] = useState(0)
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [tables, setTables] = useState([])
  const [waiters, setWaiters] = useState([])
  const [sessions, setSessions] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [reload, setReload] = useState(0)

  const range = useMemo(
    () => historyRange(filters.rangePreset, { from: customFrom, to: customTo }, restaurant),
    [filters.rangePreset, customFrom, customTo, restaurant],
  )

  function changeFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
  }

  useEffect(() => {
    if (!restaurantId) return undefined
    let active = true
    Promise.all([listTables(restaurantId), listWaiters(restaurantId)]).then(([nextTables, nextWaiters]) => {
      if (!active) return
      setTables(nextTables.data || [])
      setWaiters(nextWaiters.data || [])
    })
    return () => {
      active = false
    }
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId) return undefined
    let active = true
    listHistorySessions(restaurantId, range.from.toISOString(), range.to.toISOString()).then((result) => {
      if (!active) return
      setSessions(result.data || [])
    })
    return () => {
      active = false
    }
  }, [restaurantId, range.from, range.to])

  useEffect(() => {
    if (!restaurantId) {
      setOrders([])
      setBusy(false)
      return undefined
    }
    let active = true
    setBusy(true)
    listOrderHistory({
      restaurantId,
      fromISO: range.from.toISOString(),
      toISO: range.to.toISOString(),
      filters,
      page,
      pageSize: HISTORY_PAGE_SIZE,
    }).then((result) => {
      if (!active) return
      setOrders(result.data || [])
      setCount(result.count || 0)
      setBills(result.bills || [])
      setPayments(result.payments || [])
      setError(result.error?.message || '')
      setBusy(false)
    })
    return () => {
      active = false
    }
  }, [restaurantId, range.from, range.to, filters, page, reload])

  const billsBySession = useMemo(() => Object.fromEntries((bills || []).map((bill) => [bill.session_id, bill])), [bills])
  const paymentsByBill = useMemo(() => {
    const map = {}
    for (const row of payments || []) {
      if (!map[row.bill_id]) map[row.bill_id] = []
      map[row.bill_id].push(row)
    }
    return map
  }, [payments])

  const rows = useMemo(
    () => (orders || []).map((order) => buildHistoryRow(order, tables, billsBySession, paymentsByBill)).filter((row) => matchesQuickFilter(row, filters.quick)),
    [orders, tables, billsBySession, paymentsByBill, filters.quick],
  )
  const selected = rows.find((row) => row.order.id === selectedId) || null
  const pages = Math.max(1, Math.ceil(count / HISTORY_PAGE_SIZE))
  const waiterStats = filters.waiterId ? waiterSummary(rows) : null

  async function loadExportRows() {
    const result = await exportOrderHistory({
      restaurantId,
      fromISO: range.from.toISOString(),
      toISO: range.to.toISOString(),
      filters,
    })
    if (result.error) throw new Error(result.error.message)
    const nextBills = Object.fromEntries((result.bills || []).map((bill) => [bill.session_id, bill]))
    const nextPays = {}
    for (const row of result.payments || []) {
      if (!nextPays[row.bill_id]) nextPays[row.bill_id] = []
      nextPays[row.bill_id].push(row)
    }
    return (result.data || [])
      .map((order) => buildHistoryRow(order, tables, nextBills, nextPays))
      .filter((row) => matchesQuickFilter(row, filters.quick))
  }

  async function onExport(kind) {
    if (!restaurantId) return
    setExporting(kind)
    setNotice('')
    try {
      const exportRows = await loadExportRows()
      if (!exportRows.length) {
        setNotice('No orders match these filters.')
        setExporting('')
        return
      }
      const slug = restaurant?.slug || 'restaurant'
      const from = localDateKey(range.from)
      const to = localDateKey(addDays(range.to, -1))
      const columns = exportColumns()
      if (kind === 'xlsx') {
        downloadXlsx(`order-history-${slug}-${from}-${to}.xlsx`, [
          {
            name: 'Order History',
            rows: [
              [{ value: restaurant?.name || 'Restaurant', kind: 'text' }],
              [{ value: 'Order History', kind: 'text' }],
              [{ value: rangeLabel(range), kind: 'text' }],
              [],
              columns.map((col) => ({ value: col.label, kind: 'text' })),
              ...exportRows.map((row) => columns.map((col) => ({ value: col.value(row), kind: typeof col.value(row) === 'number' ? 'number' : 'text' }))),
            ],
          },
        ])
      } else {
        downloadCsv(`order-history-${slug}-${from}-${to}.csv`, columns, exportRows)
      }
      setNotice(`Exported ${exportRows.length} orders${exportRows.length >= HISTORY_EXPORT_LIMIT ? ' (capped at 5,000)' : ''}.`)
    } catch (err) {
      setNotice(err.message || 'Unable to export order history.')
    }
    setExporting('')
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Order history is scoped to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  const empty = !busy && !rows.length && !error
  const noMatch = empty && (filters.search || filters.quick !== 'all' || filters.orderStatus || filters.waiterId || filters.tableId)

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Order History</h1>
          <p className="mt-1 text-sm text-muted">Search and review past restaurant orders, sessions and settlements.</p>
          <p className="mt-1 text-sm font-medium">{restaurant.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="rounded-xl shadow-sm" onClick={() => setReload((value) => value + 1)}>
            Refresh
          </Button>
          <Button variant="secondary" className="rounded-xl shadow-sm" disabled={Boolean(exporting)} onClick={() => onExport('csv')}>
            {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button variant="secondary" className="rounded-xl shadow-sm" disabled={Boolean(exporting)} onClick={() => onExport('xlsx')}>
            {exporting === 'xlsx' ? 'Exporting...' : 'Export Excel'}
          </Button>
        </div>
      </div>

      <Alert>{error}</Alert>
      {notice ? <Alert type="info">{notice}</Alert> : null}

      {waiterStats ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Orders handled</p>
            <p className="mt-1 font-display text-2xl leading-none">{waiterStats.orders}</p>
          </div>
          <div className="rounded-2xl border border-line bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Order value</p>
            <p className="mt-1 font-display text-2xl leading-none tabular-nums">{formatBillMoney(waiterStats.orderValue)}</p>
          </div>
          <div className="rounded-2xl border border-line bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Settled value</p>
            <p className="mt-1 font-display text-2xl leading-none tabular-nums">{formatBillMoney(waiterStats.settledValue)}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-[20px] border border-line bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
          {HISTORY_RANGE_PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => changeFilter({ rangePreset: option.id })}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                filters.rangePreset === option.id ? 'bg-forest text-[#f5ead8]' : 'border border-line bg-white text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {filters.rangePreset === 'custom' ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className={inputClass} type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setPage(0) }} aria-label="From date" />
            <input className={inputClass} type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); setPage(0) }} aria-label="To date" />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted">{rangeLabel(range)}</p>

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {QUICK_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => changeFilter({ quick: option.id })}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                filters.quick === option.id ? 'bg-ink text-white' : 'border border-line bg-white text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select className={inputClass} value={filters.orderStatus} onChange={(event) => changeFilter({ orderStatus: event.target.value })} aria-label="Order status">
            <option value="">Order status</option>
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.kotStatus} onChange={(event) => changeFilter({ kotStatus: event.target.value })} aria-label="KOT status">
            <option value="">KOT status</option>
            {KOT_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.billStatus} onChange={(event) => changeFilter({ billStatus: event.target.value })} aria-label="Bill status">
            <option value="">Bill status</option>
            {BILL_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.paymentState} onChange={(event) => changeFilter({ paymentState: event.target.value })} aria-label="Payment state">
            <option value="">Payment state</option>
            {PAYMENT_STATE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.waiterId} onChange={(event) => changeFilter({ waiterId: event.target.value })} aria-label="Waiter">
            <option value="">Waiter</option>
            {waiters.map((waiter) => (
              <option key={waiter.id} value={waiter.id}>{waiter.full_name || waiter.waiter_id}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.tableId} onChange={(event) => changeFilter({ tableId: event.target.value })} aria-label="Table">
            <option value="">Table</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>{tableHeading(table)}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.paymentMethod} onChange={(event) => changeFilter({ paymentMethod: event.target.value })} aria-label="Payment method">
            <option value="">Payment method</option>
            {PAYMENT_METHODS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.orderType} onChange={(event) => changeFilter({ orderType: event.target.value })} aria-label="Order type">
            <option value="">Order type</option>
            {ORDER_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select className={inputClass} value={filters.sessionId} onChange={(event) => changeFilter({ sessionId: event.target.value })} aria-label="Session">
            <option value="">Session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>{session.session_number}</option>
            ))}
          </select>
          <input
            className={`${inputClass} sm:col-span-2 lg:col-span-3`}
            value={filters.search}
            onChange={(event) => changeFilter({ search: event.target.value })}
            placeholder="Search order, KOT, table, waiter or session"
          />
        </div>
      </div>

      {busy ? (
        <SkeletonRows />
      ) : empty ? (
        <EmptyState
          title={noMatch ? 'No orders match these filters' : 'No orders found'}
          body={noMatch ? 'Try another date range, waiter, table or search.' : 'Historical orders appear here after waiters place orders.'}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-[20px] border border-line bg-card shadow-sm lg:block">
            <table className="w-full min-w-[68rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2 font-medium">Order #</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Table</th>
                  <th className="px-4 py-2 font-medium">Waiter</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Items</th>
                  <th className="px-4 py-2 font-medium">Subtotal</th>
                  <th className="px-4 py-2 font-medium">KOT</th>
                  <th className="px-4 py-2 font-medium">Bill</th>
                  <th className="px-4 py-2 font-medium">Payment</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.order.id}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-paper/70"
                    onClick={() => setSelectedId(row.order.id)}
                  >
                    <td className="px-4 py-3 font-medium">#{row.order.order_number}</td>
                    <td className="px-4 py-3">{formatReportDate(row.order.created_at)}</td>
                    <td className="px-4 py-3">{formatReportTime(row.order.created_at)}</td>
                    <td className="px-4 py-3">{row.tableLabel}</td>
                    <td className="px-4 py-3">{waiterLabel(row.waiter)}</td>
                    <td className="px-4 py-3">{row.orderType}</td>
                    <td className="px-4 py-3 tabular-nums">{formatQty(row.itemCount)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatBillMoney(row.subtotal)}</td>
                    <td className="px-4 py-3">{row.kot ? `#${row.kot.kot_number}` : '—'}</td>
                    <td className="px-4 py-3">{row.bill?.bill_number || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge status={row.paymentState} label={paymentStateLabel(row.paymentState)} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={row.status} label={historyStatusLabel(row.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <button
                key={row.order.id}
                type="button"
                onClick={() => setSelectedId(row.order.id)}
                className="w-full rounded-[20px] border border-line bg-card p-4 text-left shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl">#{row.order.order_number}</p>
                    <p className="mt-1 text-sm text-muted">
                      {row.tableLabel} · {waiterLabel(row.waiter)}
                    </p>
                  </div>
                  <Badge status={row.status} label={historyStatusLabel(row.status)} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {formatReportDate(row.order.created_at)} · {formatReportTime(row.order.created_at)} · {row.orderType}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-sm text-muted">
                    {formatQty(row.itemCount)} items
                    {row.kot ? ` · KOT #${row.kot.kot_number}` : ''}
                    {row.bill?.bill_number ? ` · ${row.bill.bill_number}` : ''}
                  </p>
                  <p className="font-display text-2xl leading-none">{formatBillMoney(row.subtotal)}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted">
              {count} {count === 1 ? 'order' : 'orders'}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                Previous
              </Button>
              <span className="grid place-items-center px-2 text-muted">
                {page + 1} / {pages}
              </span>
              <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <OrderHistoryDrawer open={Boolean(selected)} row={selected} restaurant={restaurant} onClose={() => setSelectedId('')} />
    </div>
  )
}
