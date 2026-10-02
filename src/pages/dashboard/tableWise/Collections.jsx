import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Card from '../../../components/Card'
import EmptyState from '../../../components/EmptyState'
import Field, { inputClass } from '../../../components/Field'
import NavIcon from '../../../components/NavIcon'
import Spinner from '../../../components/Spinner'
import BillDetailDrawer from '../../../components/collections/BillDetailDrawer'
import CollectionTrendChart from '../../../components/collections/CollectionTrendChart'
import OutstandingBills from '../../../components/collections/OutstandingBills'
import SettledBillsTable from '../../../components/collections/SettledBillsTable'
import { MethodBreakdown, TableBreakdown, WaiterBreakdown } from '../../../components/collections/BreakdownPanels'
import { downloadCsv } from '../../../lib/csv'
import { billStatusLabel, formatBillMoney, moneyRound } from '../../../lib/orderCart'
import {
  REPORT_RANGE_PRESETS,
  addDays,
  buildRange,
  formatReportDate,
  formatReportTime,
  localDateKey,
  rangeDays,
  rangeLabel,
  rangeParams,
} from '../../../lib/reportDates'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { tableHeading } from '../../../lib/tableToken'
import { getCollectionsReport, sessionTableRowLabel } from '../../../services/collections'
import { listTables } from '../../../services/tables'
import { listWaiters } from '../../../services/waiters'

const PAGE_SIZE = 25

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'settled', label: 'Settled' },
  { id: 'partial', label: 'Partially Paid' },
  { id: 'open', label: 'Open' },
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
]

function filterParams(filter) {
  if (filter === 'cash' || filter === 'upi' || filter === 'card') return { status: 'all', method: filter }
  return { status: filter, method: null }
}

function methodSum(row, method) {
  return moneyRound((row.payments || []).reduce((sum, payment) => ((payment.method || payment.payment_method) === method ? sum + (Number(payment.amount) || 0) : sum), 0))
}

function KpiCard({ label, value, hint, accent }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl leading-none tabular-nums ${accent || ''}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
}

export default function Collections() {
  const { restaurant, loading } = useOutletContext()
  const restaurantId = restaurant?.id

  const [rangePreset, setRangePreset] = useState('today')
  const [customFrom, setCustomFrom] = useState(localDateKey(new Date()))
  const [customTo, setCustomTo] = useState(localDateKey(new Date()))
  const [filter, setFilter] = useState('all')
  const [waiterId, setWaiterId] = useState('')
  const [tableId, setTableId] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)

  const [tables, setTables] = useState([])
  const [waiters, setWaiters] = useState([])

  const range = useMemo(
    () => buildRange(rangePreset, { from: customFrom, to: customTo }),
    [rangePreset, customFrom, customTo],
  )
  const activeFilter = filterParams(filter)

  const params = useMemo(
    () => ({
      ...rangeParams(range),
      status: activeFilter.status,
      method: activeFilter.method,
      waiterId: waiterId || null,
      tableId: tableId || null,
      search: search.trim(),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [range, activeFilter.status, activeFilter.method, waiterId, tableId, search, page],
  )

  useEffect(() => {
    if (!restaurantId) return
    Promise.all([listTables(restaurantId), listWaiters(restaurantId)]).then(([tablesRes, waitersRes]) => {
      setTables(tablesRes.data || [])
      setWaiters(waitersRes.data || [])
    })
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId) {
      setReport(null)
      return undefined
    }
    let active = true
    setBusy(true)
    const delay = search.trim() ? 350 : 0
    const timer = setTimeout(async () => {
      const { data, error: reportError } = await getCollectionsReport({ restaurantId, ...params })
      if (!active) return
      if (reportError) {
        setError(reportError.message)
        setReport(null)
      } else {
        setError('')
        setReport(data)
      }
      setBusy(false)
    }, delay)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [restaurantId, params, reloadKey, search])

  function pickRange(id) {
    setRangePreset(id)
    setPage(0)
  }

  function pickFilter(id) {
    setFilter(id)
    setPage(0)
  }

  const summary = report?.summary || {}
  const total = Number(summary.total) || 0
  const singleDay = rangeDays(range) === 1
  const chartMode = singleDay && (report?.by_hour || []).length ? 'hour' : 'day'

  const reconciliation = useMemo(() => {
    const expected = moneyRound(summary.settled_payable || 0)
    const recorded = moneyRound(summary.settled_collected || 0)
    const difference = moneyRound(expected - recorded)
    return { expected, recorded, difference, flagged: Math.abs(difference) > 0.01 }
  }, [summary.settled_payable, summary.settled_collected])

  const kpis = [
    { label: 'Total Collected', value: formatBillMoney(total), hint: `${summary.payment_count || 0} payments`, accent: 'text-forest' },
    { label: 'Cash', value: formatBillMoney(summary.cash), accent: '' },
    { label: 'UPI', value: formatBillMoney(summary.upi), accent: '' },
    { label: 'Card', value: formatBillMoney(summary.card), accent: '' },
    { label: 'Settled Bills', value: String(summary.settled_bills || 0), hint: `${summary.bills || 0} bills with payments` },
  ]

  async function onExport() {
    if (!restaurantId) return
    setExporting(true)
    setNotice('')
    const { data, error: exportError } = await getCollectionsReport({
      restaurantId,
      ...params,
      limit: 5000,
      offset: 0,
    })
    setExporting(false)
    if (exportError) {
      setNotice(exportError.message)
      return
    }
    const rows = data?.bills || []
    if (!rows.length) {
      setNotice('No settlements to export for this period.')
      return
    }
    const slug = restaurant?.slug || 'restaurant'
    const filename = `collections-${slug}-${localDateKey(range.from)}-${localDateKey(addDays(range.to, -1))}.csv`
    const columns = [
      { label: 'Settlement Date', value: (row) => formatReportDate(row.settled_at) },
      { label: 'Settlement Time', value: (row) => formatReportTime(row.settled_at) },
      { label: 'Bill/Session', value: (row) => `${row.bill_number || ''} ${row.session_number || ''}`.trim() },
      { label: 'Table(s)', value: (row) => sessionTableRowLabel(row.tables) },
      { label: 'Waiter', value: (row) => row.waiter_name || row.waiter_code || '' },
      { label: 'Gross', value: (row) => moneyRound(row.subtotal) },
      { label: 'Discount', value: (row) => moneyRound(row.discount_amount) },
      { label: 'Payable', value: (row) => moneyRound(row.grand_total) },
      { label: 'Paid', value: (row) => moneyRound(row.paid) },
      { label: 'Cash', value: (row) => methodSum(row, 'cash') },
      { label: 'UPI', value: (row) => methodSum(row, 'upi') },
      { label: 'Card', value: (row) => methodSum(row, 'card') },
      { label: 'Status', value: (row) => billStatusLabel(row.status) },
    ]
    downloadCsv(filename, columns, rows)
    setNotice(`Exported ${rows.length} settlements to CSV.`)
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Collections are scoped to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  const initialLoading = busy && !report

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Collections</h1>
          <p className="mt-1 text-sm text-muted">Track daily payments, settlements and outstanding balances.</p>
          <p className="mt-0.5 text-xs text-muted">{restaurant.name} · {rangeLabel(range)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)} disabled={busy}>
            Refresh
          </Button>
          <Button onClick={onExport} disabled={exporting || !report} className="gap-2">
            <NavIcon name="download" className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>

      <Card compact className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {REPORT_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => pickRange(preset.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                rangePreset === preset.id ? 'bg-forest text-white' : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              {preset.label}
            </button>
          ))}
          {rangePreset === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2 pl-1">
              <Field label="">
                <input
                  type="date"
                  className={`${inputClass} py-1.5`}
                  value={customFrom}
                  max={customTo}
                  onChange={(event) => {
                    setCustomFrom(event.target.value)
                    setPage(0)
                  }}
                />
              </Field>
              <span className="text-muted">to</span>
              <Field label="">
                <input
                  type="date"
                  className={`${inputClass} py-1.5`}
                  value={customTo}
                  min={customFrom}
                  onChange={(event) => {
                    setCustomTo(event.target.value)
                    setPage(0)
                  }}
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => pickFilter(option.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                filter === option.id ? 'bg-ink text-white' : 'bg-white text-muted border border-line hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Waiter">
            <select
              className={inputClass}
              value={waiterId}
              onChange={(event) => {
                setWaiterId(event.target.value)
                setPage(0)
              }}
            >
              <option value="">All waiters</option>
              {waiters.map((waiter) => (
                <option key={waiter.id} value={waiter.id}>
                  {waiter.full_name || waiter.waiter_id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Table">
            <select
              className={inputClass}
              value={tableId}
              onChange={(event) => {
                setTableId(event.target.value)
                setPage(0)
              }}
            >
              <option value="">All tables</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {tableHeading(table)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search">
            <input
              className={inputClass}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
              }}
              placeholder="Bill or session number"
            />
          </Field>
        </div>
      </Card>

      {notice ? <Alert type="info">{notice}</Alert> : null}
      <Alert>{error}</Alert>
      {report?.source === 'fallback' ? (
        <Alert type="info">
          Showing fallback summaries. Run supabase/collections-report.sql in the Supabase SQL Editor for faster, server-side aggregation.
        </Alert>
      ) : null}

      {initialLoading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </div>

          {total === 0 ? (
            <EmptyState
              title={rangePreset === 'today' ? 'No collections yet' : 'No collections found for this period'}
              body="Collections appear here after the owner records Cash, UPI or Card payments on a running bill."
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Payment methods" compact className="lg:col-span-1">
              <MethodBreakdown methods={report?.by_method} total={total} />
            </Card>
            <Card
              title={chartMode === 'hour' ? 'Hourly collections' : 'Collection trend'}
              action={<span className="text-xs text-muted">{chartMode === 'hour' ? 'Today' : rangeLabel(range)}</span>}
              compact
              className="lg:col-span-2"
            >
              <CollectionTrendChart mode={chartMode} days={report?.by_day} hours={report?.by_hour} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Sales & discounts" compact>
              <div className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted">Gross sales</span>
                  <span className="tabular-nums">{formatBillMoney(summary.gross)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted">Discounts</span>
                  <span className="tabular-nums">- {formatBillMoney(summary.discount)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3 font-medium">
                  <span>Net sales</span>
                  <span className="tabular-nums">{formatBillMoney(summary.payable)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted">Collected</span>
                  <span className="tabular-nums text-forest">{formatBillMoney(total)}</span>
                </div>
              </div>
            </Card>

            <Card title="Reconciliation" compact className="lg:col-span-2">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-paper/60 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Settled payable</p>
                  <p className="mt-1 font-display text-xl tabular-nums">{formatBillMoney(reconciliation.expected)}</p>
                </div>
                <div className="rounded-xl border border-line bg-paper/60 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Recorded payments</p>
                  <p className="mt-1 font-display text-xl tabular-nums">{formatBillMoney(reconciliation.recorded)}</p>
                </div>
                <div className={`rounded-xl border px-3 py-2.5 ${reconciliation.flagged ? 'border-red-300 bg-red-50' : 'border-line bg-paper/60'}`}>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Difference</p>
                  <p className={`mt-1 font-display text-xl tabular-nums ${reconciliation.flagged ? 'text-red-700' : 'text-forest'}`}>
                    {formatBillMoney(reconciliation.difference)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                {reconciliation.flagged
                  ? 'Discrepancy detected between settled payable and recorded payments for this period. Payments are read-only and cannot be edited here.'
                  : 'Expected settlement matches recorded payments. Open balances are reported separately and are not counted as collected.'}
              </p>
            </Card>
          </div>

          <Card title="Settled bills" compact>
            <SettledBillsTable
              rows={report?.bills}
              total={report?.bills_total || 0}
              offset={page * PAGE_SIZE}
              limit={PAGE_SIZE}
              busy={busy}
              onSelect={setSelectedBill}
              onPrev={() => setPage((value) => Math.max(0, value - 1))}
              onNext={() => setPage((value) => value + 1)}
            />
          </Card>

          <Card
            title="Outstanding / open bills"
            action={<span className="text-xs text-muted">Not counted as collected</span>}
            compact
          >
            <OutstandingBills rows={report?.outstanding_bills} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Waiter breakdown" compact>
              <WaiterBreakdown rows={report?.by_waiter} />
            </Card>
            <Card title="Table breakdown" compact>
              <TableBreakdown rows={report?.by_table} />
            </Card>
          </div>
        </>
      )}

      <BillDetailDrawer open={Boolean(selectedBill)} row={selectedBill} restaurant={restaurant} onClose={() => setSelectedBill(null)} />
    </div>
  )
}
