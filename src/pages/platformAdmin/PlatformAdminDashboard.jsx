import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { loadOverview } from '../../services/platformAdmin'
import {
  formatCount,
  formatMoney,
  RANGE_PRESETS,
  rangeFromDays,
  toDateInput,
} from '../../lib/platformAdmin'

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

export default function PlatformAdminDashboard() {
  const initial = useMemo(() => rangeFromDays(30), [])
  const [presetId, setPresetId] = useState('30')
  const [from, setFrom] = useState(toDateInput(initial.from))
  const [to, setTo] = useState(toDateInput(initial.to))
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (fromDate, toDate) => {
    setLoading(true)
    setError('')
    const fromIso = new Date(`${fromDate}T00:00:00`).toISOString()
    const toIso = new Date(`${toDate}T23:59:59`).toISOString()
    const { data, error: nextError } = await loadOverview({ from: fromIso, to: toIso })
    if (nextError) {
      setError(nextError.message)
      setMetrics(null)
    } else {
      setMetrics(data?.metrics || null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load(from, to)
  }, [load, from, to])

  function applyPreset(preset) {
    const range = rangeFromDays(preset.days)
    setPresetId(preset.id)
    setFrom(toDateInput(range.from))
    setTo(toDateInput(range.to))
  }

  const hasMetrics = Boolean(metrics)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Platform-wide overview across every restaurant.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/platform-admin/reports"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Platform Reports
          </Link>
          <Link
            to="/platform-admin/restaurants"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View all restaurants
          </Link>
        </div>
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
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-500">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPresetId('')
                  setFrom(e.target.value)
                }}
                className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
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
                className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              />
            </label>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => load(from, to)} disabled={loading}>
              {loading ? 'Loading...' : 'Apply'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Total restaurants" value={hasMetrics ? formatCount(metrics.total_restaurants) : '—'} />
        <Metric label="Active restaurants" value={hasMetrics ? formatCount(metrics.active_restaurants) : '—'} />
        <Metric label="Inactive / suspended" value={hasMetrics ? formatCount(metrics.inactive_restaurants) : '—'} />
        <Metric
          label="Orders (period)"
          value={hasMetrics ? formatCount(metrics.total_orders) : '—'}
          hint="Based on orders created in the selected range"
        />
        <Metric
          label="Revenue (period)"
          value={hasMetrics ? formatMoney(metrics.total_revenue) : '—'}
          hint="Based on recorded payments in the selected range"
        />
        <Metric label="Active waiters" value={hasMetrics ? formatCount(metrics.active_waiters) : '—'} />
      </div>

      <p className="text-xs text-slate-400">
        Metrics are computed server-side against live data. Revenue uses recorded payments; orders use creation time.
      </p>
    </div>
  )
}
