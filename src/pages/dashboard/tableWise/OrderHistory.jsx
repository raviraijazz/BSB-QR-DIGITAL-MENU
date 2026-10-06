import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import { inputClass } from '../../../components/Field'
import NavIcon from '../../../components/NavIcon'
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
  buildHistoryRow,
  emptyHistoryFilters,
  formatHistoryDate,
  formatHistoryTime,
  historyDateKey,
  historyRange,
  historyRangeLabel,
  historyStatusLabel,
  historyWaiterName,
  pageNumbers,
  paymentStateLabel,
  statusTone,
} from '../../../lib/orderHistory'
import { formatBillMoney, formatQty, PAYMENT_METHODS } from '../../../lib/orderCart'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { tableHeading } from '../../../lib/tableToken'
import { downloadXlsx } from '../../../lib/xlsx'
import { exportOrderHistory, listOrderHistory } from '../../../services/orderHistory'
import { listTables } from '../../../services/tables'
import { listWaiters } from '../../../services/waiters'

const filterSelectClass = `${inputClass} py-2`

function Badge({ status, label }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(status)}`}>{label}</span>
}

function hashNum(value) {
  const text = String(value || '').replace(/^#/, '')
  return text ? `#${text}` : '—'
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-xl bg-paper" />
      ))}
    </div>
  )
}

function exportColumns(restaurant) {
  return [
    { label: 'Order #', value: (row) => row.order.order_number },
    { label: 'Date', value: (row) => formatHistoryDate(row.order.created_at, restaurant) },
    { label: 'Time', value: (row) => formatHistoryTime(row.order.created_at, restaurant) },
    { label: 'Table', value: (row) => row.tableLabel },
    { label: 'Waiter', value: (row) => historyWaiterName(row.waiter) },
    { label: 'Order Type', value: (row) => row.orderType },
    { label: 'Items', value: (row) => formatQty(row.itemCount) },
    { label: 'Subtotal', value: (row) => row.subtotal },
    { label: 'KOT', value: (row) => (row.kot ? row.kot.kot_number : '') },
    { label: 'Bill', value: (row) => row.bill?.bill_number || '' },
    { label: 'Payment', value: (row) => paymentStateLabel(row.paymentState) },
    { label: 'Status', value: (row) => historyStatusLabel(row.status) },
  ]
}

function FilterField({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

export default function OrderHistory() {
  const { restaurant, loading } = useOutletContext()
  const restaurantId = restaurant?.id
  const [filters, setFilters] = useState(emptyHistoryFilters)
  const [searchInput, setSearchInput] = useState('')
  const [customFrom, setCustomFrom] = useState(() => historyDateKey(new Date(), restaurant))
  const [customTo, setCustomTo] = useState(() => historyDateKey(new Date(), restaurant))
  const [page, setPage] = useState(0)
  const [orders, setOrders] = useState([])
  const [count, setCount] = useState(0)
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [tables, setTables] = useState([])
  const [waiters, setWaiters] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [checked, setChecked] = useState([])
  const [reload, setReload] = useState(0)
  const exportRef = useRef(null)

  const range = useMemo(
    () => historyRange(filters.rangePreset, { from: customFrom, to: customTo }, restaurant),
    [filters.rangePreset, customFrom, customTo, restaurant],
  )

  function changeFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
    setChecked([])
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (filters.search === searchInput) return
      setFilters((current) => ({ ...current, search: searchInput }))
      setPage(0)
      setChecked([])
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, filters.search])

  useEffect(() => {
    function onClick(event) {
      if (!exportRef.current?.contains(event.target)) setExportOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (filters.rangePreset !== 'custom') {
      const today = historyDateKey(new Date(), restaurant)
      setCustomFrom(today)
      setCustomTo(today)
    }
  }, [restaurant?.id, restaurant?.timezone, filters.rangePreset])

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
    () => (orders || []).map((order) => buildHistoryRow(order, tables, billsBySession, paymentsByBill)),
    [orders, tables, billsBySession, paymentsByBill],
  )
  const selected = rows.find((row) => row.order.id === selectedId) || null
  const pages = Math.max(1, Math.ceil(count / HISTORY_PAGE_SIZE))
  const fromRow = count ? page * HISTORY_PAGE_SIZE + 1 : 0
  const toRow = Math.min(count, (page + 1) * HISTORY_PAGE_SIZE)
  const pageIds = rows.map((row) => row.order.id)
  const allChecked = pageIds.length > 0 && pageIds.every((id) => checked.includes(id))

  function toggleAll() {
    setChecked(allChecked ? checked.filter((id) => !pageIds.includes(id)) : [...new Set([...checked, ...pageIds])])
  }

  function toggleOne(id) {
    setChecked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

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
    return (result.data || []).map((order) => buildHistoryRow(order, tables, nextBills, nextPays))
  }

  async function onExport(kind, selectedOnly = false) {
    if (!restaurantId) return
    setExporting(kind)
    setExportOpen(false)
    setNotice('')
    try {
      const loadedRows = await loadExportRows()
      const exportRows = selectedOnly ? loadedRows.filter((row) => checked.includes(row.order.id)) : loadedRows
      if (!exportRows.length) {
        setNotice(selectedOnly ? 'Select at least one order to export.' : 'No orders match these filters.')
        setExporting('')
        return
      }
      const slug = restaurant?.slug || 'restaurant'
      const from = historyDateKey(range.from, restaurant)
      const to = historyDateKey(new Date(range.to.getTime() - 1), restaurant)
      const columns = exportColumns(restaurant)
      if (kind === 'xlsx') {
        downloadXlsx(`order-history-${slug}-${from}-${to}.xlsx`, [
          {
            name: 'Order History',
            rows: [
              [{ value: restaurant?.name || 'Restaurant', kind: 'text' }],
              [{ value: 'Order History', kind: 'text' }],
              [{ value: historyRangeLabel(range, restaurant), kind: 'text' }],
              [],
              columns.map((col) => ({ value: col.label, kind: 'text' })),
              ...exportRows.map((row) =>
                columns.map((col) => ({ value: col.value(row), kind: typeof col.value(row) === 'number' ? 'number' : 'text' })),
              ),
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
  const filtered =
    Boolean(filters.search) ||
    filters.orderStatus ||
    filters.kotStatus ||
    filters.billStatus ||
    filters.waiterId ||
    filters.tableId ||
    filters.paymentMethod ||
    filters.orderType
  const noMatch = empty && filtered

  const filterCard = (
    <div className="rounded-[18px] border border-line bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted">Date Range</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink">
              <svg className="h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M8 3v4M16 3v4M4 10h16" />
              </svg>
              {historyRangeLabel(range, restaurant)}
            </span>
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
          </div>
        </div>
      </div>
      {filters.rangePreset === 'custom' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input className={inputClass} type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setPage(0) }} aria-label="From date" />
          <input className={inputClass} type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); setPage(0) }} aria-label="To date" />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <FilterField label="Order Status">
          <select className={filterSelectClass} value={filters.orderStatus} onChange={(event) => changeFilter({ orderStatus: event.target.value })}>
            <option value="">All</option>
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="KOT Status">
          <select className={filterSelectClass} value={filters.kotStatus} onChange={(event) => changeFilter({ kotStatus: event.target.value })}>
            <option value="">All</option>
            {KOT_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Bill Status">
          <select className={filterSelectClass} value={filters.billStatus} onChange={(event) => changeFilter({ billStatus: event.target.value })}>
            <option value="">All</option>
            {BILL_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Waiter">
          <select className={filterSelectClass} value={filters.waiterId} onChange={(event) => changeFilter({ waiterId: event.target.value })}>
            <option value="">All</option>
            {waiters.map((waiter) => (
              <option key={waiter.id} value={waiter.id}>{waiter.full_name || waiter.waiter_id}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Table">
          <select className={filterSelectClass} value={filters.tableId} onChange={(event) => changeFilter({ tableId: event.target.value })}>
            <option value="">All</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>{tableHeading(table)}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Payment Method">
          <select className={filterSelectClass} value={filters.paymentMethod} onChange={(event) => changeFilter({ paymentMethod: event.target.value })}>
            <option value="">All</option>
            {PAYMENT_METHODS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Order Type">
          <select className={filterSelectClass} value={filters.orderType} onChange={(event) => changeFilter({ orderType: event.target.value })}>
            <option value="">All</option>
            {ORDER_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Search">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              className={`${filterSelectClass} pl-9`}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Order #, KOT #, Table, Waiter, Session..."
            />
          </div>
        </FilterField>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">
            <Link to="/dashboard" className="hover:text-ink">Dashboard</Link>
            <span className="px-1.5">›</span>
            <Link to={TABLE_WISE_HOME} className="hover:text-ink">Table-wise order</Link>
            <span className="px-1.5">›</span>
            <span className="text-ink">Order History</span>
          </p>
          <h1 className="mt-1 font-display text-3xl leading-tight">Order History</h1>
          <p className="mt-1 text-sm text-muted">Search and review past restaurant orders, sessions and settlements.</p>
          <p className="mt-1 text-sm font-medium">{restaurant.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="rounded-xl shadow-sm lg:hidden" onClick={() => setFiltersOpen((open) => !open)}>
            Filters
          </Button>
          <div className="relative" ref={exportRef}>
            <Button variant="secondary" className="rounded-xl shadow-sm" disabled={Boolean(exporting)} onClick={() => setExportOpen((open) => !open)}>
              <NavIcon name="download" className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export'}
              <NavIcon name="chevron" className="h-3.5 w-3.5" />
            </Button>
            {exportOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg">
                <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onExport('csv')}>
                  Export CSV
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onExport('xlsx')}>
                  Export Excel
                </button>
                {checked.length ? (
                  <>
                    <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onExport('csv', true)}>
                      Export selected CSV ({checked.length})
                    </button>
                    <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onExport('xlsx', true)}>
                      Export selected Excel ({checked.length})
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <Button variant="secondary" className="rounded-xl shadow-sm" onClick={() => setReload((value) => value + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      <Alert>{error}</Alert>
      {notice ? <Alert type="info">{notice}</Alert> : null}

      <div className={filtersOpen ? 'block' : 'hidden lg:block'}>{filterCard}</div>

      <div className={selected ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,1.05fr)]' : ''}>
        <section className="min-w-0 overflow-hidden rounded-[18px] border border-line bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <h2 className="font-display text-lg">Orders ({count})</h2>
            {checked.length ? <p className="text-xs text-muted">{checked.length} selected</p> : null}
          </div>

          {busy ? (
            <SkeletonRows />
          ) : empty ? (
            <div className="px-4 pb-6">
              <EmptyState
                title={noMatch ? 'No orders match these filters.' : 'No orders found'}
                body={noMatch ? 'Try another date range, waiter, table or search.' : 'Historical orders appear here after waiters place orders.'}
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[64rem] text-sm">
                  <thead>
                    <tr className="border-y border-line bg-paper/80 text-left text-[12px] text-muted">
                      <th className="w-10 px-3 py-2 font-medium">
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select page" />
                      </th>
                      <th className="px-2 py-2 font-medium">Order #</th>
                      <th className="px-2 py-2 font-medium">Date & Time</th>
                      <th className="px-2 py-2 font-medium">Table</th>
                      <th className="px-2 py-2 font-medium">Waiter</th>
                      <th className="px-2 py-2 font-medium">Items</th>
                      <th className="px-2 py-2 font-medium">Subtotal</th>
                      <th className="px-2 py-2 font-medium">KOT</th>
                      <th className="px-2 py-2 font-medium">Bill</th>
                      <th className="px-2 py-2 font-medium">Payment</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="w-8 px-2 py-2 font-medium"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const active = row.order.id === selectedId
                      return (
                        <tr
                          key={row.order.id}
                          className={`cursor-pointer border-b border-line last:border-b-0 ${active ? 'bg-emerald-50/70' : 'hover:bg-paper/70'}`}
                          onClick={() => setSelectedId(row.order.id)}
                        >
                          <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={checked.includes(row.order.id)} onChange={() => toggleOne(row.order.id)} aria-label={`Select order ${row.order.order_number}`} />
                          </td>
                          <td className="px-2 py-2.5 font-semibold text-forest">{hashNum(row.order.order_number)}</td>
                          <td className="px-2 py-2.5 leading-tight">
                            <span className="block">{formatHistoryDate(row.order.created_at, restaurant)}</span>
                            <span className="text-[11px] text-muted">{formatHistoryTime(row.order.created_at, restaurant)}</span>
                          </td>
                          <td className="px-2 py-2.5">{row.tableLabel}</td>
                          <td className="px-2 py-2.5">{historyWaiterName(row.waiter)}</td>
                          <td className="px-2 py-2.5 tabular-nums">{formatQty(row.itemCount)}</td>
                          <td className="px-2 py-2.5 font-medium tabular-nums">{formatBillMoney(row.subtotal)}</td>
                          <td className="px-2 py-2.5 text-forest">{row.kot ? hashNum(row.kot.kot_number) : '—'}</td>
                          <td className="px-2 py-2.5 text-forest">{row.bill?.bill_number ? hashNum(row.bill.bill_number) : '—'}</td>
                          <td className="px-2 py-2.5">
                            <Badge status={row.paymentState} label={paymentStateLabel(row.paymentState)} />
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge status={row.status} label={historyStatusLabel(row.status)} />
                          </td>
                          <td className="px-2 py-2.5 text-muted">
                            <NavIcon name="chevron" className="h-4 w-4 -rotate-90" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 p-3 md:hidden">
                {rows.map((row) => (
                  <button
                    key={row.order.id}
                    type="button"
                    onClick={() => setSelectedId(row.order.id)}
                    className={`w-full rounded-2xl border p-4 text-left shadow-sm ${row.order.id === selectedId ? 'border-forest/30 bg-emerald-50/70' : 'border-line bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-xl text-forest">{hashNum(row.order.order_number)}</p>
                        <p className="mt-1 text-sm text-muted">
                          {row.tableLabel} · {historyWaiterName(row.waiter)}
                        </p>
                      </div>
                      <Badge status={row.status} label={historyStatusLabel(row.status)} />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {formatHistoryDate(row.order.created_at, restaurant)} · {formatHistoryTime(row.order.created_at, restaurant)}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p className="text-sm text-muted">
                        {formatQty(row.itemCount)} items
                        {row.kot ? ` · KOT ${hashNum(row.kot.kot_number)}` : ''}
                      </p>
                      <p className="font-display text-2xl leading-none">{formatBillMoney(row.subtotal)}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted">
                  Showing {fromRow} to {toRow} of {count} {count === 1 ? 'order' : 'orders'}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted disabled:opacity-40"
                    disabled={page <= 0}
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                    aria-label="Previous page"
                  >
                    <NavIcon name="chevron" className="h-4 w-4 rotate-90" />
                  </button>
                  {pageNumbers(page, pages).map((item, index) =>
                    item === '…' ? (
                      <span key={`e${index}`} className="px-1 text-muted">…</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item - 1)}
                        className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-medium ${
                          item === page + 1 ? 'bg-forest text-[#f5ead8]' : 'border border-line bg-white text-ink'
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-muted disabled:opacity-40"
                    disabled={page + 1 >= pages}
                    onClick={() => setPage((value) => value + 1)}
                    aria-label="Next page"
                  >
                    <NavIcon name="chevron" className="h-4 w-4 -rotate-90" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {selected ? (
          <div className="hidden min-h-[42rem] lg:block">
            <OrderHistoryDrawer row={selected} restaurant={restaurant} onClose={() => setSelectedId('')} />
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-50 bg-paper">
            <OrderHistoryDrawer row={selected} restaurant={restaurant} onClose={() => setSelectedId('')} mobile />
          </div>
        </div>
      ) : null}
    </div>
  )
}
