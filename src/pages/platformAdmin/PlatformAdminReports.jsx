import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import { downloadCsv } from '../../lib/csv'
import {
  RANGE_PRESETS,
  STATUS_META,
  STATUS_OPTIONS,
  formatCount,
  formatDate,
  formatMoney,
  rangeFromDays,
  remainingDaysLabel,
  toDateInput,
} from '../../lib/platformAdmin'
import {
  EXPIRY_WINDOWS,
  ORDER_STATUSES,
  REPORT_BUCKETS,
  REPORT_TABS,
  SALES_PAYMENT_METHODS,
  billingCsvColumns,
  billingUnavailable,
  chooseBucket,
  expiryCsvColumns,
  isValidityRenewal,
  normalizeReport,
  operationalOrderCount,
  orderStatusCsvColumns,
  reportFilename,
  restaurantCsvColumns,
  salesCsvColumns,
  seriesToChart,
  utcRangeFromDateKeys,
} from '../../lib/platformReports'
import {
  listPlatformRestaurants,
  listSubscriptionInvoices,
  listSubscriptionPlans,
  loadPlatformReports,
} from '../../services/platformAdmin'

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || '—', className: 'bg-slate-50 text-slate-700 border-slate-200' }
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function BarChart({ rows = [], emptyLabel, valueLabel = 'value' }) {
  const list = (rows || []).filter((row) => Number(row.amount) >= 0)
  if (!list.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
        {emptyLabel || 'No values in this period'}
      </p>
    )
  }
  const max = Math.max(...list.map((row) => Number(row.amount) || 0), 1)
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-end gap-2" style={{ minWidth: `${Math.max(list.length * 2.5, 16)}rem` }}>
        {list.map((row) => (
          <div key={row.key} className="flex min-w-[2rem] flex-1 flex-col items-center">
            <span className="mb-1 h-4 text-[10px] tabular-nums text-slate-400">
              {row.amount ? (valueLabel === 'money' ? formatMoney(row.amount) : formatCount(row.amount)) : ''}
            </span>
            <div className="flex h-32 w-full items-end justify-center" title={`${row.label} · ${row.amount}`}>
              <div
                className="w-full max-w-[34px] rounded-t-md bg-gradient-to-t from-blue-700 to-blue-400"
                style={{ height: `${Math.max((Number(row.amount) / max) * 100, Number(row.amount) > 0 ? 4 : 1)}%` }}
              />
            </div>
            <span className="mt-1 w-full truncate text-center text-[10px] text-slate-500">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Panel({ title, hint, children, action }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</h2>
          {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function unwrap(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data || null
}

export default function PlatformAdminReports() {
  const initial = useMemo(() => rangeFromDays(30), [])
  const [tab, setTab] = useState('overview')
  const [presetId, setPresetId] = useState('30')
  const [from, setFrom] = useState(toDateInput(initial.from))
  const [to, setTo] = useState(toDateInput(initial.to))
  const [restaurantId, setRestaurantId] = useState('')
  const [status, setStatus] = useState('')
  const [planId, setPlanId] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [bucket, setBucket] = useState('day')
  const [expiryDays, setExpiryDays] = useState(30)
  const [restaurants, setRestaurants] = useState([])
  const [plans, setPlans] = useState([])
  const [report, setReport] = useState(normalizeReport(null))
  const [invoiceRows, setInvoiceRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const range = useMemo(() => utcRangeFromDateKeys(from, to), [from, to])

  const loadLookups = useCallback(async () => {
    const [restaurantResult, planResult] = await Promise.all([
      listPlatformRestaurants({ pageSize: 100 }),
      listSubscriptionPlans(false),
    ])
    setRestaurants(restaurantResult.data?.items || [])
    setPlans(planResult.data || [])
  }, [])

  const load = useCallback(async () => {
    if (range.error) {
      setError(range.error)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const nextBucket = bucket || chooseBucket(from, to)
    const { data, error: nextError } = await loadPlatformReports({
      from: range.from,
      to: range.toExclusive,
      restaurantId: restaurantId || null,
      status,
      planId: planId || null,
      orderStatus,
      paymentMethod,
      bucket: nextBucket,
      expiryDays,
    })
    if (nextError) {
      setError(nextError.message)
      setReport(normalizeReport(null))
      setInvoiceRows([])
      setLoading(false)
      return
    }
    const next = normalizeReport(unwrap(data))
    setReport(next)
    if (!billingUnavailable(next.billing)) {
      const invoiceResult = await listSubscriptionInvoices({
        search: '',
        planId: planId || null,
        from,
        to,
        page: 1,
        pageSize: 50,
      })
      setInvoiceRows(Array.isArray(invoiceResult.data) ? invoiceResult.data : [])
    } else {
      setInvoiceRows([])
    }
    setLoading(false)
  }, [range, from, to, restaurantId, status, planId, orderStatus, paymentMethod, bucket, expiryDays])

  useEffect(() => {
    loadLookups()
  }, [loadLookups])

  useEffect(() => {
    load()
  }, [load])

  function applyPreset(preset) {
    const next = rangeFromDays(preset.days)
    setPresetId(preset.id)
    setFrom(toDateInput(next.from))
    setTo(toDateInput(next.to))
    setBucket(chooseBucket(toDateInput(next.from), toDateInput(next.to)))
  }

  const kpis = report.kpis
  const statusCounts = kpis.status || {}
  const method = kpis.gmv_by_method || {}
  const billingOff = billingUnavailable(report.billing)

  function exportCurrent() {
    if (tab === 'orders') {
      downloadCsv(reportFilename('platform-orders', from, to), orderStatusCsvColumns(), report.orders_by_status)
      return
    }
    if (tab === 'payments') {
      downloadCsv(reportFilename('platform-sales', from, to), salesCsvColumns(), report.top_restaurants)
      return
    }
    if (tab === 'billing') {
      downloadCsv(reportFilename('platform-subscription-invoices', from, to), billingCsvColumns(), invoiceRows)
      return
    }
    if (tab === 'subscriptions') {
      downloadCsv(reportFilename('platform-expiring', from, to), expiryCsvColumns(), report.expiring)
      return
    }
    downloadCsv(reportFilename('platform-restaurants', from, to), restaurantCsvColumns(), report.top_restaurants)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cross-restaurant founder analytics. Restaurant customer collections and subscription billing stay separate.
            Dates are UTC calendar days. This page does not change any records.
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={exportCurrent} disabled={loading}>
          Export CSV
        </Button>
      </div>

      <Alert>{error}</Alert>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  presetId === preset.id
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="text-xs font-medium text-slate-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPresetId('')
                setFrom(e.target.value)
              }}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPresetId('')
                setTo(e.target.value)
              }}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Bucket
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              {REPORT_BUCKETS.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Restaurant
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">All restaurants</option>
              {restaurants.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name || 'Unnamed restaurant'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Access
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Plan
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
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
            Order status
            <select
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              {ORDER_STATUSES.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Sales method
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              {SALES_PAYMENT_METHODS.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Period {from} to {to} (UTC, end date inclusive). Frozen and blocked restaurants are never counted as active.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORT_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-3 py-2 text-sm ${
              tab === item.id ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          Loading platform reports...
        </div>
      ) : (
        <>
          {tab === 'overview' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Registered restaurants" value={formatCount(kpis.restaurants_total)} hint="All time, after filters" />
                <Metric
                  label="Registered in period"
                  value={formatCount(kpis.restaurants_created)}
                  hint="restaurants.created_at"
                />
                <Metric
                  label="Active"
                  value={formatCount(statusCounts.active)}
                  hint="Effective status, not stored status"
                />
                <Metric label="Frozen" value={formatCount(statusCounts.frozen)} />
                <Metric label="Blocked" value={formatCount(statusCounts.blocked)} />
                <Metric label="Expired" value={formatCount(statusCounts.expired)} hint="valid_until in the past" />
                <Metric
                  label="Orders in period"
                  value={formatCount(operationalOrderCount(kpis, Boolean(orderStatus)))}
                  hint={orderStatus ? 'Filtered order status' : 'Excludes cancelled unless status filter is Cancelled'}
                />
                <Metric
                  label="Customer collections"
                  value={formatMoney(kpis.gmv)}
                  hint="public.payments.paid_at, excluding cancelled bills"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Restaurant growth" hint="New restaurants by UTC bucket">
                  <BarChart rows={seriesToChart(report.series.signups, 'count')} emptyLabel="No restaurants registered in this period" />
                </Panel>
                <Panel title="Customer collections trend" hint="Restaurant order payments only">
                  <BarChart
                    rows={seriesToChart(report.series.gmv, 'amount')}
                    emptyLabel="No customer payments in this period"
                    valueLabel="money"
                  />
                </Panel>
              </div>
              <Panel title="Expiring soon" hint="Active restaurants with valid_until in the next 30 days">
                {report.expiring.length === 0 ? (
                  <EmptyState title="None approaching expiry" body="No active restaurants expire in the selected window." />
                ) : (
                  <p className="text-sm text-slate-600">
                    {formatCount(kpis.expiring?.d7)} in 7 days · {formatCount(kpis.expiring?.d30)} in 30 days ·{' '}
                    {formatCount(kpis.expiring?.d90)} in 90 days
                  </p>
                )}
              </Panel>
            </>
          ) : null}

          {tab === 'restaurants' ? (
            <>
              <Panel title="Registrations over time" hint="Does not count frozen or blocked as active">
                <BarChart rows={seriesToChart(report.series.signups, 'count')} emptyLabel="No registrations in this period" />
              </Panel>
              <Panel title="Restaurants" hint="Open a row to use existing founder restaurant management.">
                {report.top_restaurants.length === 0 ? (
                  <EmptyState title="No restaurants" body="No restaurants match the current filters." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Restaurant</th>
                          <th className="px-3 py-2 font-medium">Registered</th>
                          <th className="px-3 py-2 font-medium">Access</th>
                          <th className="px-3 py-2 font-medium">Plan</th>
                          <th className="px-3 py-2 font-medium">Expiry</th>
                          <th className="px-3 py-2 font-medium">Orders</th>
                          <th className="px-3 py-2 font-medium">Collections</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.top_restaurants.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-3">
                              <Link to={`/platform-admin/restaurants/${row.id}`} className="font-medium text-blue-700 hover:underline">
                                {row.name || 'Unnamed restaurant'}
                              </Link>
                              <p className="text-xs text-slate-400">{row.id}</p>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{formatDate(row.created_at)}</td>
                            <td className="px-3 py-3">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="px-3 py-3 text-slate-600">{row.plan_name || 'Unassigned'}</td>
                            <td className="px-3 py-3 text-slate-600">
                              {row.valid_until ? formatDate(row.valid_until) : 'No expiry'}
                              <p className="text-xs text-slate-400">{remainingDaysLabel(row.remaining_days)}</p>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{formatCount(row.order_count)}</td>
                            <td className="px-3 py-3 text-slate-600">{formatMoney(row.gmv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {tab === 'orders' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Orders"
                  value={formatCount(operationalOrderCount(kpis, Boolean(orderStatus)))}
                  hint="Customer orders table. Not KOTs or sessions."
                />
                <Metric label="Cancelled" value={formatCount(kpis.orders_cancelled)} />
                <Metric
                  label="Average bill"
                  value={kpis.average_bill == null ? 'Not available' : formatMoney(kpis.average_bill)}
                  hint="Non-cancelled bills.grand_total / bill count"
                />
                <Metric
                  label="Open bill remainder"
                  value={formatMoney(kpis.outstanding_bills)}
                  hint="Open or payment_pending bills minus recorded payments"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Orders over time" hint="Cancelled orders omitted from the trend">
                  <BarChart rows={seriesToChart(report.series.orders, 'count')} emptyLabel="No orders in this period" />
                </Panel>
                <Panel title="Orders by status" hint="Uses public.orders.status">
                  <BarChart
                    rows={(report.orders_by_status || []).map((row) => ({
                      key: row.status,
                      label: row.status,
                      amount: Number(row.count) || 0,
                      count: Number(row.count) || 0,
                    }))}
                    emptyLabel="No orders in this period"
                  />
                </Panel>
              </div>
              <Panel title="Activity by restaurant">
                {report.top_restaurants.length === 0 ? (
                  <EmptyState title="No order activity" body="No restaurants match the current filters." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Restaurant</th>
                          <th className="px-3 py-2 font-medium">Access</th>
                          <th className="px-3 py-2 font-medium">Orders</th>
                          <th className="px-3 py-2 font-medium">Collections</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.top_restaurants.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-3">
                              <Link to={`/platform-admin/restaurants/${row.id}`} className="text-blue-700 hover:underline">
                                {row.name || 'Unnamed restaurant'}
                              </Link>
                            </td>
                            <td className="px-3 py-3">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="px-3 py-3">{formatCount(row.order_count)}</td>
                            <td className="px-3 py-3">{formatMoney(row.gmv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {tab === 'payments' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Collected" value={formatMoney(kpis.gmv)} hint="Customer payments, not subscription invoices" />
                <Metric label="Cash" value={formatMoney(method.cash)} />
                <Metric label="UPI" value={formatMoney(method.upi)} />
                <Metric label="Card" value={formatMoney(method.card)} />
              </div>
              <Panel title="Collection trend" hint="paid_at. Cancelled bills excluded. No refund/failed status exists on public.payments.">
                <BarChart
                  rows={seriesToChart(report.series.gmv, 'amount')}
                  emptyLabel="No customer payments in this period"
                  valueLabel="money"
                />
              </Panel>
              <Panel title="Restaurant-wise totals">
                {report.top_restaurants.length === 0 ? (
                  <EmptyState title="No collections" body="No customer payments match the current filters." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Restaurant</th>
                          <th className="px-3 py-2 font-medium">Cash</th>
                          <th className="px-3 py-2 font-medium">UPI</th>
                          <th className="px-3 py-2 font-medium">Card</th>
                          <th className="px-3 py-2 font-medium">Collected</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.top_restaurants.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-3">
                              <Link to={`/platform-admin/restaurants/${row.id}`} className="text-blue-700 hover:underline">
                                {row.name || 'Unnamed restaurant'}
                              </Link>
                            </td>
                            <td className="px-3 py-3">{formatMoney(row.cash)}</td>
                            <td className="px-3 py-3">{formatMoney(row.upi)}</td>
                            <td className="px-3 py-3">{formatMoney(row.card)}</td>
                            <td className="px-3 py-3">{formatMoney(row.gmv)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {tab === 'billing' ? (
            billingOff ? (
              <EmptyState
                title="Subscription billing reports unavailable"
                body="Run supabase/subscription-billing.sql after subscription-plans.sql, then create invoices in Payments & History. Assigned plans are not collected revenue."
                actionTo="/platform-admin/subscriptions/payments"
                actionLabel="Open Payments & History"
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Collected"
                    value={formatMoney(report.billing.collected)}
                    hint="Invoice payments minus refunds. Not restaurant GMV."
                  />
                  <Metric label="Invoiced in period" value={formatMoney(report.billing.invoiced)} hint="Created invoices, not cash collected" />
                  <Metric label="Outstanding" value={formatMoney(report.billing.outstanding)} />
                  <Metric
                    label="Paid / partial / overdue"
                    value={`${formatCount(report.billing.paid_count)} / ${formatCount(report.billing.partial_count)} / ${formatCount(report.billing.overdue_count)}`}
                  />
                </div>
                <Panel title="Subscription collections trend" hint="Uses payment_date, not invoice_date">
                  <BarChart
                    rows={seriesToChart(report.billing.trend, 'amount')}
                    emptyLabel="No subscription payments in this period"
                    valueLabel="money"
                  />
                </Panel>
                <Panel
                  title="Invoices in period"
                  hint="Partial payments are not double-counted. Invoice date filter."
                  action={
                    <Link to="/platform-admin/subscriptions/payments" className="text-sm text-blue-700 hover:underline">
                      Payments & History
                    </Link>
                  }
                >
                  {invoiceRows.length === 0 ? (
                    <EmptyState title="No invoices" body="No subscription invoices in this period." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Invoice</th>
                            <th className="px-3 py-2 font-medium">Restaurant</th>
                            <th className="px-3 py-2 font-medium">Amount</th>
                            <th className="px-3 py-2 font-medium">Paid</th>
                            <th className="px-3 py-2 font-medium">Balance</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {invoiceRows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-3 py-3">{row.invoice_number}</td>
                              <td className="px-3 py-3">{row.restaurant_name}</td>
                              <td className="px-3 py-3">{formatMoney(row.amount_inr)}</td>
                              <td className="px-3 py-3">{formatMoney(row.paid_amount_inr)}</td>
                              <td className="px-3 py-3">{formatMoney(row.balance_inr)}</td>
                              <td className="px-3 py-3">{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </>
            )
          ) : null}

          {tab === 'subscriptions' ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-slate-500">
                  Expiring window
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    className="mt-1 block rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                  >
                    {EXPIRY_WINDOWS.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-slate-400">
                  Unassigned plans: {formatCount(kpis.unassigned_plan)}. A plan switch is not a renewal unless validity
                  was changed.
                </p>
              </div>
              <Panel title="Restaurants by plan">
                {(report.plan_mix || []).length === 0 ? (
                  <EmptyState title="No plan assignments" body="Create plans and assign them in Subscription & Plans." />
                ) : (
                  <BarChart
                    rows={(report.plan_mix || []).map((row) => ({
                      key: row.plan_id || 'none',
                      label: row.plan_name || 'Unassigned',
                      amount: Number(row.restaurant_count) || 0,
                      count: Number(row.restaurant_count) || 0,
                    }))}
                    emptyLabel="No plan assignments"
                  />
                )}
              </Panel>
              <Panel title="Expiring restaurants" hint={`Active with valid_until in the next ${expiryDays} days`}>
                {report.expiring.length === 0 ? (
                  <EmptyState title="None approaching expiry" body="No active restaurants expire in this window." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Restaurant</th>
                          <th className="px-3 py-2 font-medium">Plan</th>
                          <th className="px-3 py-2 font-medium">Valid until</th>
                          <th className="px-3 py-2 font-medium">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.expiring.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-3">
                              <Link to={`/platform-admin/restaurants/${row.id}`} className="text-blue-700 hover:underline">
                                {row.name || 'Unnamed restaurant'}
                              </Link>
                            </td>
                            <td className="px-3 py-3">{row.plan_name || 'Unassigned'}</td>
                            <td className="px-3 py-3">{formatDate(row.valid_until)}</td>
                            <td className="px-3 py-3">{remainingDaysLabel(row.remaining_days)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
              <Panel title="Assignments in period" hint="Renewal means change_validity was recorded. Plan-only switches are labelled separately.">
                {(report.assignments || []).length === 0 ? (
                  <EmptyState title="No assignment events" body="No subscription assignments in this period." />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {(report.assignments || []).map((row) => (
                      <li key={row.id} className="rounded-xl border border-slate-200 px-3 py-2">
                        <p className="font-medium">
                          {row.restaurant_name} · {row.plan_name || 'Plan'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isValidityRenewal(row) ? 'Validity changed / renewal' : 'Plan assignment only'} · {row.source} ·{' '}
                          {formatDate(row.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
