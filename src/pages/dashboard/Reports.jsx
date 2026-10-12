import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import NavIcon from '../../components/NavIcon'
import Spinner from '../../components/Spinner'
import AnalyticsChart from '../../components/collections/AnalyticsChart'
import PivotTable from '../../components/collections/PivotTable'
import ReportTable from '../../components/collections/ReportTable'
import ReportToolbar from '../../components/collections/ReportToolbar'
import { MethodBreakdown } from '../../components/collections/BreakdownPanels'
import { defaultConfig, emptyAnalyticsFilters, MEASURES, reportDefaults, reportMeta } from '../../lib/analyticsCatalog'
import { runAnalytics, sanitizeConfig } from '../../lib/analyticsEngine'
import { formatBillMoney, moneyRound } from '../../lib/orderCart'
import {
  historyDateKey,
  historyRange,
  historyRangeLabel,
  restaurantTimeZone,
} from '../../lib/orderHistory'
import { REPORT_RANGE_PRESETS, rangeDays, rangeParams, tzOffsetMinutesForZone } from '../../lib/reportDates'
import { downloadReportCsv, downloadReportPdf, downloadReportXlsx, printReport, whatsappShareUrl } from '../../lib/reportExport'
import { loadAnalyticsData } from '../../services/analytics'
import { deleteSavedReport, listSavedReports, saveReport, updateSavedReport } from '../../services/savedReports'
import { listCategories } from '../../services/categories'
import { listMenuItems } from '../../services/menuItems'
import { listTables } from '../../services/tables'
import { listWaiters } from '../../services/waiters'

const PAGE_SIZE = 25

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'collections', label: 'Collections' },
  { id: 'sales', label: 'Sales' },
  { id: 'payments', label: 'Payments' },
  { id: 'items', label: 'Items' },
  { id: 'waiters', label: 'Waiters' },
  { id: 'tables', label: 'Tables' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'custom', label: 'Custom Reports' },
]

const QUICK_REPORTS = [
  { id: 'collections', label: 'Daily collections' },
  { id: 'sales', label: 'Sales / orders' },
  { id: 'items', label: 'Top items' },
  { id: 'payments', label: 'Payment mix' },
  { id: 'waiters', label: 'Waiter performance' },
  { id: 'tables', label: 'Table / sessions' },
  { id: 'outstanding', label: 'Outstanding bills' },
  { id: 'discounts', label: 'Discounts' },
]

const VIEWS = [
  { id: 'list', label: 'List' },
  { id: 'graph', label: 'Graph' },
  { id: 'pivot', label: 'Pivot' },
]

const EXPORTS = [
  { id: 'xlsx', label: 'Excel (.xlsx)' },
  { id: 'csv', label: 'CSV' },
  { id: 'pdf', label: 'PDF' },
  { id: 'print', label: 'Print' },
  { id: 'whatsapp', label: 'WhatsApp summary' },
]

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
    view: type === 'custom' ? next.view : next.view === 'overview' ? 'list' : next.view,
  }
}

function analyticsParams(range, restaurant) {
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    tzOffsetMinutes: tzOffsetMinutesForZone(restaurantTimeZone(restaurant), range.from),
  }
}

async function runReport(restaurantId, type, config, range, restaurant) {
  const loaded = await loadAnalyticsData(restaurantId, type, rangeParams(range))
  if (loaded.error) return { error: loaded.error, capped: loaded.capped }
  return {
    analytics: runAnalytics(type, loaded.data, config, analyticsParams(range, restaurant)),
    capped: Boolean(loaded.capped),
  }
}

function methodRows(analytics) {
  const map = { cash: { amount: 0, count: 0 }, upi: { amount: 0, count: 0 }, card: { amount: 0, count: 0 } }
  for (const fact of analytics?.facts || []) {
    for (const method of ['cash', 'upi', 'card']) {
      const amount = Number(fact[method]) || 0
      if (amount > 0) {
        map[method].amount = moneyRound(map[method].amount + amount)
        map[method].count += 1
      }
    }
  }
  return ['cash', 'upi', 'card'].map((method) => ({ method, ...map[method] })).filter((row) => row.amount > 0)
}

export default function Reports() {
  const { restaurant, loading } = useOutletContext()
  const restaurantId = restaurant?.id
  const exportRef = useRef(null)

  const [tab, setTab] = useState('overview')
  const [config, setConfig] = useState(() => defaultConfig('collections'))
  const [customFrom, setCustomFrom] = useState(() => historyDateKey(new Date(), null))
  const [customTo, setCustomTo] = useState(() => historyDateKey(new Date(), null))
  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  const [analytics, setAnalytics] = useState(null)
  const [rawData, setRawData] = useState(null)
  const [overview, setOverview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [capped, setCapped] = useState(false)

  const [tables, setTables] = useState([])
  const [waiters, setWaiters] = useState([])
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [saved, setSaved] = useState([])
  const [saving, setSaving] = useState(false)

  const range = useMemo(
    () => historyRange(config.rangePreset, { from: customFrom, to: customTo }, restaurant),
    [config.rangePreset, customFrom, customTo, restaurant],
  )
  const clean = useMemo(() => sanitizeConfig(config), [config])
  const reportTab = tab !== 'overview' && tab !== 'custom' ? tab : clean.reportType
  const showCustom = tab === 'custom'

  useEffect(() => {
    if (config.rangePreset !== 'custom') {
      const today = historyDateKey(new Date(), restaurant)
      setCustomFrom(today)
      setCustomTo(today)
    }
  }, [restaurant?.id, restaurant?.timezone, config.rangePreset])

  useEffect(() => {
    function onClick(event) {
      if (!exportRef.current?.contains(event.target)) setExportOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

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

  const rangeKey = `${range.from.toISOString()}|${range.to.toISOString()}|${reloadKey}`
  const loadKey = `${clean.reportType}|${rangeKey}`
  const params = useMemo(() => analyticsParams(range, restaurant), [range, restaurant])

  useEffect(() => {
    if (!restaurantId || tab !== 'overview') return undefined
    let active = true
    setBusy(true)
    const hourOrDay = rangeDays(range) === 1 ? 'hour' : 'day'
    Promise.all([
      runReport(restaurantId, 'collections', defaultConfig('collections'), range, restaurant),
      runReport(restaurantId, 'sales', { ...defaultConfig('sales'), groups: [hourOrDay], view: 'graph' }, range, restaurant),
      runReport(restaurantId, 'items', defaultConfig('items'), range, restaurant),
      runReport(restaurantId, 'tables', defaultConfig('tables'), range, restaurant),
      runReport(restaurantId, 'outstanding', defaultConfig('outstanding'), range, restaurant),
    ]).then(([collections, sales, items, tableRows, outstanding]) => {
      if (!active) return
      const firstError = collections.error || sales.error || items.error || tableRows.error || outstanding.error
      setError(firstError?.message || '')
      setCapped(Boolean(collections.capped || sales.capped || items.capped || tableRows.capped || outstanding.capped))
      setOverview({
        collections: collections.analytics || null,
        sales: sales.analytics || null,
        items: items.analytics || null,
        tables: tableRows.analytics || null,
        outstanding: outstanding.analytics || null,
      })
      setAnalytics(collections.analytics || null)
      setRawData(null)
      setBusy(false)
    })
    return () => {
      active = false
    }
  }, [restaurantId, tab, rangeKey, restaurant, range])

  useEffect(() => {
    if (!restaurantId || tab === 'overview') return undefined
    let active = true
    setBusy(true)
    setRawData(null)
    loadAnalyticsData(restaurantId, clean.reportType, rangeParams(range)).then((loaded) => {
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
    })
    return () => {
      active = false
    }
  }, [restaurantId, tab, loadKey, clean.reportType, range])

  useEffect(() => {
    if (!rawData || tab === 'overview') {
      if (tab !== 'overview') setAnalytics(null)
      return
    }
    setAnalytics(runAnalytics(clean.reportType, rawData, clean, params))
  }, [rawData, tab, clean, params])

  function changeConfig(next) {
    const typeChanged = next.reportType !== config.reportType
    setConfig(typeChanged ? applyReportType(next, next.reportType) : next)
    setPage(0)
  }

  function pickRange(id) {
    changeConfig({ ...config, rangePreset: id })
  }

  function openTab(id) {
    setTab(id)
    setPage(0)
    setNotice('')
    if (id === 'overview' || id === 'custom') return
    changeConfig({ ...config, reportType: id })
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
    setTab('custom')
    setPage(0)
    setNotice(`Loaded “${row.name}”.`)
  }

  async function currentAnalytics() {
    if (tab === 'overview' && overview?.collections) return { data: overview.collections }
    if (analytics) return { data: analytics }
    const result = await runReport(restaurantId, clean.reportType, clean, range, restaurant)
    if (result.error) return { error: result.error }
    return { data: result.analytics }
  }

  async function onExport(kind) {
    setExportOpen(false)
    setExporting(kind)
    setNotice('')
    const result = await currentAnalytics()
    setExporting('')
    if (result.error) {
      setNotice(result.error.message)
      return
    }
    const payload = result.data
    const exportConfig = tab === 'overview' ? defaultConfig('collections') : clean
    if (!payload?.facts?.length && !payload?.grouped?.length) {
      setNotice('No rows to export for this period.')
      return
    }
    try {
      if (kind === 'csv') setNotice(`Exported ${downloadReportCsv(restaurant, range, payload, exportConfig)} rows to CSV.`)
      else if (kind === 'xlsx') setNotice(`Exported ${downloadReportXlsx(restaurant, range, payload, exportConfig)} rows to Excel.`)
      else if (kind === 'pdf') setNotice(`Exported ${await downloadReportPdf(restaurant, range, payload, exportConfig)} rows to PDF.`)
      else if (kind === 'print') printReport(restaurant, range, payload, exportConfig)
      else if (kind === 'whatsapp') {
        window.open(whatsappShareUrl(restaurant, range, payload, exportConfig), '_blank', 'noopener')
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
        body="Reports are scoped to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  const collections = overview?.collections
  const sales = overview?.sales
  const items = overview?.items
  const tableAnalytics = overview?.tables
  const outstanding = overview?.outstanding
  const collected = Number(collections?.totals?.paid) || 0
  const gross = Number(sales?.totals?.gross) || 0
  const orderCount = Number(sales?.totals?.orderCount) || 0
  const discount = Number(collections?.totals?.discount) || 0
  const outstandingAmt = Number(outstanding?.totals?.outstanding) || 0
  const topItems = (items?.grouped || [])
    .slice()
    .sort((a, b) => (b.measures.itemQty || 0) - (a.measures.itemQty || 0) || (b.measures.gross || 0) - (a.measures.gross || 0))
    .slice(0, 8)
  const recentSales = (sales?.facts || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.at) - new Date(a.createdAt || a.at))
    .slice(0, 8)
  const tableRows = (tableAnalytics?.grouped || [])
    .slice()
    .sort((a, b) => (b.measures.paid || 0) - (a.measures.paid || 0))
    .slice(0, 8)
  const orderTypeRows = gross
    ? [{ key: 'dine_in', label: 'Dine-in', amount: gross, count: orderCount }]
    : []
  const analyticsKpis = (clean.measures || []).map((id) => {
    const measure = MEASURES.find((row) => row.id === id)
    const value = analytics?.totals?.[id] || 0
    return {
      label: measure?.label || id,
      value: measure?.kind === 'money' ? formatBillMoney(value) : String(Math.round(value)),
    }
  })
  const initialLoading = busy && ((tab === 'overview' && !overview) || (tab !== 'overview' && !analytics))
  const zone = restaurantTimeZone(restaurant) || 'local time'

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Restaurant reports</p>
          <h1 className="mt-1 font-display text-3xl">{tab === 'overview' ? 'Reports & Analytics' : reportMeta(reportTab).label}</h1>
          <p className="mt-1 text-sm text-muted">
            {tab === 'overview'
              ? 'Sales, collections and menu performance for the selected period. Outstanding is not counted as collected.'
              : reportMeta(reportTab).hint}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {restaurant.name} · {historyRangeLabel(range, restaurant)} · {zone}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)} disabled={busy}>
            Refresh
          </Button>
          <div className="relative" ref={exportRef}>
            <Button onClick={() => setExportOpen((value) => !value)} disabled={Boolean(exporting) || (!analytics && !overview)} className="gap-2">
              <NavIcon name="download" className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            {exportOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
                {EXPORTS.map((item) => (
                  <button key={item.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onExport(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Card compact className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openTab(item.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                tab === item.id ? 'bg-forest text-white' : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {REPORT_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => pickRange(preset.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                config.rangePreset === preset.id ? 'bg-ink text-white' : 'bg-white text-muted border border-line hover:text-ink'
              }`}
            >
              {preset.label}
            </button>
          ))}
          {config.rangePreset === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2 pl-1">
              <Field label="">
                <input type="date" className={`${inputClass} py-1.5`} value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} />
              </Field>
              <span className="text-muted">to</span>
              <Field label="">
                <input type="date" className={`${inputClass} py-1.5`} value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} />
              </Field>
            </div>
          ) : null}
        </div>
        {tab === 'overview' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_REPORTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openTab(item.id)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : (
          <ReportToolbar
            config={clean}
            onChange={changeConfig}
            range={range}
            customFrom={customFrom}
            customTo={customTo}
            onRange={pickRange}
            onCustomFrom={setCustomFrom}
            onCustomTo={setCustomTo}
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
            views={VIEWS}
            showTypes={showCustom}
            showRange={false}
          />
        )}
      </Card>

      {notice ? <Alert type="info">{notice}</Alert> : null}
      <Alert>{error}</Alert>
      {capped ? <Alert type="info">This view is limited to the latest 5,000 matching rows. Narrow the date range for a complete export.</Alert> : null}

      {initialLoading ? (
        <Spinner />
      ) : tab === 'overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Gross sales" value={formatBillMoney(gross)} hint={`${orderCount} orders`} />
            <KpiCard label="Collected" value={formatBillMoney(collected)} hint="Valid payments only" accent="text-forest" />
            <KpiCard label="Cash / UPI / Card" value={formatBillMoney(moneyRound((collections?.totals?.cash || 0) + (collections?.totals?.upi || 0) + (collections?.totals?.card || 0)))} hint={`${formatBillMoney(collections?.totals?.cash)} · ${formatBillMoney(collections?.totals?.upi)} · ${formatBillMoney(collections?.totals?.card)}`} />
            <KpiCard label="Discount" value={formatBillMoney(discount)} />
            <KpiCard label="Outstanding" value={formatBillMoney(outstandingAmt)} hint="Not counted as collected" />
          </div>

          {!collected && !gross ? (
            <EmptyState
              title={config.rangePreset === 'today' ? 'No sales yet' : 'No activity for this period'}
              body="Reports use stored bill totals and recorded Cash, UPI or Card payments. Open balances stay in Outstanding."
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Payment mix" compact className="lg:col-span-1">
              <MethodBreakdown methods={methodRows(collections)} total={collected} />
            </Card>
            <Card title={rangeDays(range) === 1 ? 'Hourly sales' : 'Sales trend'} compact className="lg:col-span-2">
              <AnalyticsChart rows={sales?.chartRows} emptyLabel="No sales in this period" />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Order type" compact>
              <AnalyticsChart rows={orderTypeRows} emptyLabel="No orders in this period" />
              <p className="mt-2 text-[11px] text-muted">Table-wise orders are recorded as dine-in. Takeaway and delivery are not billed in this report.</p>
            </Card>
            <Card title="Top items" compact>
              {topItems.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="py-2 pr-3 text-right font-medium">Qty</th>
                        <th className="py-2 text-right font-medium">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((row) => (
                        <tr key={row.id} className="border-b border-line last:border-b-0">
                          <td className="py-2 pr-3 font-medium">{row.labels.item || 'Item'}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{Math.round(row.measures.itemQty || 0)}</td>
                          <td className="py-2 text-right tabular-nums">{formatBillMoney(row.measures.gross)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted">No items sold in this period</p>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Recent sales" compact>
              {recentSales.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                        <th className="py-2 pr-3 font-medium">Order</th>
                        <th className="py-2 pr-3 font-medium">Table</th>
                        <th className="py-2 pr-3 font-medium">Waiter</th>
                        <th className="py-2 text-right font-medium">Gross</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSales.map((row) => (
                        <tr key={row.id} className="border-b border-line last:border-b-0">
                          <td className="py-2 pr-3">
                            <span className="font-medium">{row.orderNo || 'Order'}</span>
                            <span className="block text-[11px] text-muted">{row.status || '—'}</span>
                          </td>
                          <td className="py-2 pr-3">{row.table || '—'}</td>
                          <td className="py-2 pr-3">{row.waiter || '—'}</td>
                          <td className="py-2 text-right tabular-nums">{formatBillMoney(row.gross)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted">No orders in this period</p>
              )}
            </Card>
            <Card title="Tables" compact>
              {tableRows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                        <th className="py-2 pr-3 font-medium">Table</th>
                        <th className="py-2 pr-3 text-right font-medium">Bills</th>
                        <th className="py-2 text-right font-medium">Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row) => (
                        <tr key={row.id} className="border-b border-line last:border-b-0">
                          <td className="py-2 pr-3 font-medium">{row.labels.table || 'Table'}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.measures.billCount || 0}</td>
                          <td className="py-2 text-right tabular-nums">{formatBillMoney(row.measures.paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted">No table collections in this period</p>
              )}
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
                emptyLabel="No rows for this report"
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

    </div>
  )
}
