import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Card from '../../../components/Card'
import EmptyState from '../../../components/EmptyState'
import NavIcon from '../../../components/NavIcon'
import Spinner from '../../../components/Spinner'
import AnalyticsChart from '../../../components/collections/AnalyticsChart'
import BillDetailDrawer from '../../../components/collections/BillDetailDrawer'
import CollectionTrendChart from '../../../components/collections/CollectionTrendChart'
import OutstandingBills from '../../../components/collections/OutstandingBills'
import PivotTable from '../../../components/collections/PivotTable'
import ReportTable from '../../../components/collections/ReportTable'
import ReportToolbar from '../../../components/collections/ReportToolbar'
import SettledBillsTable from '../../../components/collections/SettledBillsTable'
import { MethodBreakdown, TableBreakdown, WaiterBreakdown } from '../../../components/collections/BreakdownPanels'
import { defaultConfig, emptyAnalyticsFilters, MEASURES, reportDefaults, reportMeta } from '../../../lib/analyticsCatalog'
import { runAnalytics, sanitizeConfig } from '../../../lib/analyticsEngine'
import {
  addDays,
  buildRange,
  formatReportDate,
  formatReportTime,
  localDateKey,
  rangeDays,
  rangeLabel,
  rangeParams,
} from '../../../lib/reportDates'
import { downloadReportCsv, downloadReportPdf, downloadReportXlsx, printReport, whatsappShareUrl } from '../../../lib/reportExport'
import { billStatusLabel, formatBillMoney, moneyRound } from '../../../lib/orderCart'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { downloadCsv } from '../../../lib/csv'
import { getCollectionsReport, sessionTableRowLabel } from '../../../services/collections'
import { loadAnalyticsData } from '../../../services/analytics'
import { deleteSavedReport, listSavedReports, saveReport, updateSavedReport } from '../../../services/savedReports'
import { listCategories } from '../../../services/categories'
import { listMenuItems } from '../../../services/menuItems'
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

const VIEWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'list', label: 'List' },
  { id: 'graph', label: 'Graph' },
  { id: 'pivot', label: 'Pivot' },
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

function applyReportType(prev, type) {
  const next = defaultConfig(type)
  return {
    ...next,
    rangePreset: prev.rangePreset,
    customFrom: prev.customFrom,
    customTo: prev.customTo,
    search: prev.search,
    filters: { ...emptyAnalyticsFilters(), waiterId: prev.filters?.waiterId || '', tableId: prev.filters?.tableId || '' },
    view: type === 'collections' ? 'overview' : next.view,
  }
}

export default function Collections() {
  const { restaurant, loading } = useOutletContext()
  const restaurantId = restaurant?.id

  const [config, setConfig] = useState(() => defaultConfig('collections'))
  const [customFrom, setCustomFrom] = useState(localDateKey(new Date()))
  const [customTo, setCustomTo] = useState(localDateKey(new Date()))
  const [legacyFilter, setLegacyFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  const [report, setReport] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [rawData, setRawData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
  const [capped, setCapped] = useState(false)

  const [tables, setTables] = useState([])
  const [waiters, setWaiters] = useState([])
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [saved, setSaved] = useState([])
  const [saving, setSaving] = useState(false)

  const range = useMemo(
    () => buildRange(config.rangePreset, { from: customFrom, to: customTo }),
    [config.rangePreset, customFrom, customTo],
  )
  const clean = useMemo(() => sanitizeConfig(config), [config])
  const overview = clean.reportType === 'collections' && clean.view === 'overview'
  const activeFilter = filterParams(legacyFilter)

  const collectionParams = useMemo(
    () => ({
      ...rangeParams(range),
      status: activeFilter.status,
      method: activeFilter.method || clean.filters.method || null,
      waiterId: clean.filters.waiterId || null,
      tableId: clean.filters.tableId || null,
      search: clean.search.trim(),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [range, activeFilter.status, activeFilter.method, clean.filters.method, clean.filters.waiterId, clean.filters.tableId, clean.search, page],
  )

  useEffect(() => {
    if (!restaurantId) return
    Promise.all([listTables(restaurantId), listWaiters(restaurantId), listCategories(restaurantId), listMenuItems(restaurantId), listSavedReports(restaurantId)]).then(
      ([tablesRes, waitersRes, categoriesRes, itemsRes, savedRes]) => {
        setTables(tablesRes.data || [])
        setWaiters(waitersRes.data || [])
        setCategories(categoriesRes.data || [])
        setMenuItems(itemsRes.data || [])
        if (savedRes.error) setNotice(savedRes.error.message)
        setSaved(savedRes.data || [])
      },
    )
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId || !overview) return undefined
    let active = true
    setBusy(true)
    const delay = clean.search.trim() ? 350 : 0
    const timer = setTimeout(async () => {
      const { data, error: reportError } = await getCollectionsReport({ restaurantId, ...collectionParams })
      if (!active) return
      if (reportError) {
        setError(reportError.message)
        setReport(null)
      } else {
        setError('')
        setReport(data)
      }
      setAnalytics(null)
      setRawData(null)
      setCapped(false)
      setBusy(false)
    }, delay)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [restaurantId, overview, collectionParams, reloadKey, clean.search])

  const loadKey = `${clean.reportType}|${range.from.toISOString()}|${range.to.toISOString()}|${reloadKey}`

  useEffect(() => {
    if (!restaurantId || overview) return undefined
    let active = true
    setBusy(true)
    setRawData(null)
    const timer = setTimeout(async () => {
      const loaded = await loadAnalyticsData(restaurantId, clean.reportType, rangeParams(range))
      if (!active) return
      if (loaded.error) {
        setError(loaded.error.message)
        setAnalytics(null)
        setRawData(null)
        setBusy(false)
        return
      }
      setError('')
      setCapped(Boolean(loaded.capped))
      setRawData(loaded.data)
      setBusy(false)
    }, 0)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [restaurantId, overview, loadKey])

  useEffect(() => {
    if (!rawData || overview) {
      if (!overview) setAnalytics(null)
      return
    }
    setAnalytics(
      runAnalytics(clean.reportType, rawData, clean, {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        tzOffsetMinutes: rangeParams(range).tzOffsetMinutes,
      }),
    )
  }, [rawData, overview, clean, range])

  function changeConfig(next) {
    const typeChanged = next.reportType !== config.reportType
    setConfig(typeChanged ? applyReportType(next, next.reportType) : next)
    setPage(0)
  }

  function pickRange(id) {
    changeConfig({ ...config, rangePreset: id })
  }

  async function refreshSaved() {
    const { data, error: savedError } = await listSavedReports(restaurantId)
    if (savedError) setNotice(savedError.message)
    else setSaved(data || [])
  }

  async function onSave(name) {
    setSaving(true)
    setNotice('')
    const { error: saveError } = await saveReport(restaurantId, {
      name,
      report_type: clean.reportType,
      config: { ...clean, customFrom, customTo },
    })
    setSaving(false)
    if (saveError) {
      setNotice(saveError.message)
      return
    }
    setNotice('Report view saved for this restaurant.')
    refreshSaved()
  }

  async function onUpdateSaved(row) {
    setSaving(true)
    const { error: saveError } = await updateSavedReport(row.id, restaurantId, {
      report_type: clean.reportType,
      config: { ...clean, customFrom, customTo },
    })
    setSaving(false)
    if (saveError) setNotice(saveError.message)
    else {
      setNotice(`Updated “${row.name}”.`)
      refreshSaved()
    }
  }

  async function onDeleteSaved(row) {
    const { error: deleteError } = await deleteSavedReport(row.id, restaurantId)
    if (deleteError) setNotice(deleteError.message)
    else {
      setNotice(`Deleted “${row.name}”.`)
      refreshSaved()
    }
  }

  async function onFavorite(row) {
    const { error: saveError } = await updateSavedReport(row.id, restaurantId, { is_favorite: !row.is_favorite })
    if (saveError) setNotice(saveError.message)
    else refreshSaved()
  }

  function onLoadSaved(row) {
    const loaded = sanitizeConfig({ ...defaultConfig(row.report_type), ...(row.config || {}), reportType: row.report_type })
    setConfig(loaded)
    if (loaded.customFrom) setCustomFrom(loaded.customFrom)
    if (loaded.customTo) setCustomTo(loaded.customTo)
    setPage(0)
    setNotice(`Loaded “${row.name}”.`)
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

  const analyticsKpis = (clean.measures || []).map((id) => {
    const measure = MEASURES.find((row) => row.id === id)
    const value = analytics?.totals?.[id] || 0
    return {
      label: measure?.label || id,
      value: measure?.kind === 'money' ? formatBillMoney(value) : String(Math.round(value)),
    }
  })

  async function currentAnalytics() {
    const loaded = await loadAnalyticsData(restaurantId, clean.reportType, rangeParams(range))
    if (loaded.error) return { error: loaded.error }
    return {
      data: runAnalytics(clean.reportType, loaded.data, clean, {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        tzOffsetMinutes: rangeParams(range).tzOffsetMinutes,
      }),
    }
  }

  async function onExportCollectionsCsv() {
    if (!restaurantId) return
    setExporting('csv')
    setNotice('')
    const { data, error: exportError } = await getCollectionsReport({
      restaurantId,
      ...collectionParams,
      limit: 5000,
      offset: 0,
    })
    setExporting('')
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

  async function onExport(kind) {
    setExportOpen(false)
    if (overview && kind === 'csv') {
      await onExportCollectionsCsv()
      return
    }
    setExporting(kind)
    setNotice('')
    const result = analytics ? { data: analytics } : await currentAnalytics()
    setExporting('')
    if (result.error) {
      setNotice(result.error.message)
      return
    }
    const payload = result.data
    if (!payload?.facts?.length && !payload?.grouped?.length) {
      setNotice('No rows to export for this period.')
      return
    }
    try {
      if (kind === 'csv') {
        const count = downloadReportCsv(restaurant, range, payload, clean)
        setNotice(`Exported ${count} rows to CSV.`)
      } else if (kind === 'xlsx') {
        const count = downloadReportXlsx(restaurant, range, payload, clean)
        setNotice(`Exported ${count} rows to Excel.`)
      } else if (kind === 'pdf') {
        const count = await downloadReportPdf(restaurant, range, payload, clean)
        setNotice(`Exported ${count} rows to PDF.`)
      } else if (kind === 'print') {
        printReport(restaurant, range, payload, clean)
      } else if (kind === 'whatsapp') {
        window.open(whatsappShareUrl(restaurant, range, payload, clean), '_blank', 'noopener')
        setNotice('WhatsApp opens a text summary only. Attach Excel, CSV or PDF yourself — files are not sent from this app.')
      }
    } catch {
      setNotice('Unable to export this report. Please try again.')
    }
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

  const initialLoading = busy && ((overview && !report) || (!overview && !analytics))
  const views = clean.reportType === 'collections' ? VIEWS : VIEWS.filter((view) => view.id !== 'overview')

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">{overview ? 'Collections' : reportMeta(clean.reportType).label}</h1>
          <p className="mt-1 text-sm text-muted">
            {overview ? 'Track daily payments, settlements and outstanding balances.' : reportMeta(clean.reportType).hint}
          </p>
          <p className="mt-0.5 text-xs text-muted">{restaurant.name} · {rangeLabel(range)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)} disabled={busy}>
            Refresh
          </Button>
          <div className="relative">
            <Button onClick={() => setExportOpen((value) => !value)} disabled={Boolean(exporting) || (!report && !analytics)} className="gap-2">
              <NavIcon name="download" className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            {exportOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
                {[
                  { id: 'xlsx', label: 'Excel (.xlsx)' },
                  { id: 'csv', label: 'CSV' },
                  { id: 'pdf', label: 'PDF' },
                  { id: 'print', label: 'Print' },
                  { id: 'whatsapp', label: 'WhatsApp summary' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
                    onClick={() => onExport(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Card compact className="space-y-4">
        <ReportToolbar
          config={clean}
          onChange={changeConfig}
          range={range}
          customFrom={customFrom}
          customTo={customTo}
          onRange={pickRange}
          onCustomFrom={(value) => {
            setCustomFrom(value)
            setPage(0)
          }}
          onCustomTo={(value) => {
            setCustomTo(value)
            setPage(0)
          }}
          tables={tables}
          waiters={waiters}
          categories={categories}
          menuItems={menuItems}
          saved={saved}
          onLoadSaved={onLoadSaved}
          onSave={onSave}
          onUpdateSaved={onUpdateSaved}
          onDeleteSaved={onDeleteSaved}
          onFavorite={onFavorite}
          saving={saving}
          views={views}
          extraFilters={
            overview ? (
              <div className="sm:col-span-3 flex flex-wrap items-center gap-1.5">
                {FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setLegacyFilter(option.id)
                      setPage(0)
                    }}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                      legacyFilter === option.id ? 'bg-ink text-white' : 'bg-white text-muted border border-line hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      </Card>

      {notice ? <Alert type="info">{notice}</Alert> : null}
      <Alert>{error}</Alert>
      {report?.source === 'fallback' ? (
        <Alert type="info">
          Showing fallback summaries. Run supabase/collections-report.sql in the Supabase SQL Editor for faster, server-side aggregation.
        </Alert>
      ) : null}
      {capped && !overview ? (
        <Alert type="info">This view is limited to the latest 5,000 matching rows. Narrow the date range for a complete export.</Alert>
      ) : null}

      {initialLoading ? (
        <Spinner />
      ) : overview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </div>

          {total === 0 ? (
            <EmptyState
              title={config.rangePreset === 'today' ? 'No collections yet' : 'No collections found for this period'}
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
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {analyticsKpis.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </div>
          {clean.view === 'graph' ? (
            <Card title={`${reportMeta(clean.reportType).label} graph`} compact>
              <AnalyticsChart rows={analytics?.chartRows} />
            </Card>
          ) : null}
          {clean.view === 'pivot' ? (
            <Card title="Pivot" compact>
              <PivotTable pivot={analytics?.pivot} config={clean} />
            </Card>
          ) : (
            <Card title={reportDefaults(clean.reportType).groups.length ? 'Grouped results' : 'Rows'} compact>
              <ReportTable
                analytics={analytics || { facts: [], grouped: [] }}
                config={clean}
                page={page}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                onSort={(key) => {
                  const dir = clean.sort?.key === key && clean.sort.dir === 'desc' ? 'asc' : 'desc'
                  changeConfig({ ...config, sort: { key, dir } })
                }}
              />
            </Card>
          )}
        </>
      )}

      <BillDetailDrawer open={Boolean(selectedBill)} row={selectedBill} restaurant={restaurant} onClose={() => setSelectedBill(null)} />
    </div>
  )
}
