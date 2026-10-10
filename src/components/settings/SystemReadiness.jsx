import { useMemo, useState } from 'react'
import Button from '../Button'
import Spinner from '../Spinner'
import { QA_CHECKS, QA_TABS, tabMeta } from '../../lib/qaCatalog'
import { downloadQaCsv, downloadQaPdf, downloadQaXlsx } from '../../lib/qaReport'
import { runQaSuite } from '../../lib/qaRunner'

const STATUS_STYLES = {
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  fail: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-950',
  manual: 'border-line bg-paper text-ink',
  skip: 'border-line bg-paper text-muted',
}

const GATE_STYLES = {
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warnings: 'border-amber-200 bg-amber-50 text-amber-950',
  'not-ready': 'border-red-200 bg-red-50 text-red-900',
}

function statusLabel(status) {
  if (status === 'pass') return 'Pass'
  if (status === 'fail') return 'Fail'
  if (status === 'warn') return 'Warn'
  if (status === 'skip') return 'Skip'
  return 'Manual'
}

function ProgressBar({ counts }) {
  const total = Math.max(counts?.total || 0, 1)
  const parts = [
    { key: 'pass', className: 'bg-emerald-700', value: counts?.pass || 0 },
    { key: 'fail', className: 'bg-red-700', value: counts?.fail || 0 },
    { key: 'warn', className: 'bg-amber-600', value: counts?.warn || 0 },
    { key: 'manual', className: 'bg-stone-400', value: (counts?.manual || 0) + (counts?.skip || 0) },
  ]
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-line">
      {parts.map((part) => (
        <span
          key={part.key}
          className={part.className}
          style={{ width: `${(part.value / total) * 100}%` }}
        />
      ))}
    </div>
  )
}

export default function SystemReadiness({ restaurant, user }) {
  const [tab, setTab] = useState('features')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: QA_CHECKS.length })
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  const visible = useMemo(
    () => (results || []).filter((row) => row.tab === tab),
    [results, tab],
  )
  const tabStats = summary?.byTab?.[tab]

  async function runAll() {
    if (busy) return
    setBusy(true)
    setError('')
    setProgress({ done: 0, total: QA_CHECKS.length })
    try {
      const next = await runQaSuite({
        restaurant,
        user,
        onProgress: (_row, done, total) => setProgress({ done, total }),
      })
      setResults(next.results)
      setSummary(next.summary)
    } catch (nextError) {
      setError(nextError?.message || 'Unable to run the readiness suite.')
    }
    setBusy(false)
  }

  function requireResults() {
    if (results.length) return true
    setError('Run the suite before downloading a report.')
    return false
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Live checks against this restaurant. Pass means the check succeeded. Fail means it did not. Manual means a person still has to confirm it.
      </p>

      <div className={`rounded-[16px] border p-4 ${GATE_STYLES[summary?.gate?.id] || 'border-line bg-white'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Production gate</p>
            <h3 className="mt-1 font-display text-2xl">{summary?.gate?.label || 'Not run'}</h3>
            <p className="mt-1 text-sm text-muted">{summary?.gate?.detail || 'Run the suite to score this restaurant.'}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl">{summary ? `${summary.score}%` : '—'}</p>
            <p className="text-[11px] text-muted">of scored checks</p>
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar counts={summary?.counts || { total: 1 }} />
          <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted">
            <span>Pass {summary?.counts?.pass || 0}</span>
            <span>Fail {summary?.counts?.fail || 0}</span>
            <span>Warn {summary?.counts?.warn || 0}</span>
            <span>Manual {summary?.counts?.manual || 0}</span>
            {busy ? <span>Running {progress.done}/{progress.total}</span> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={runAll} disabled={busy}>{busy ? 'Running...' : 'Run suite'}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => requireResults() && downloadQaCsv(restaurant, results, summary)}>CSV</Button>
        <Button variant="secondary" disabled={busy} onClick={() => requireResults() && downloadQaXlsx(restaurant, results, summary)}>Excel</Button>
        <Button variant="secondary" disabled={busy} onClick={() => requireResults() && downloadQaPdf(restaurant, results, summary).catch((next) => setError(next?.message || 'Unable to download PDF.'))}>PDF</Button>
      </div>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {QA_TABS.map((item) => {
          const stats = summary?.byTab?.[item.id]
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-[16px] border p-3 text-left ${active ? 'border-forest bg-forest text-[#f5ead8]' : 'border-line bg-white hover:bg-paper'}`}
            >
              <p className="text-sm font-medium">{item.label}</p>
              <p className={`mt-1 text-[11px] ${active ? 'text-[#f5ead8]/80' : 'text-muted'}`}>
                {stats
                  ? `${stats.score}% · ${stats.pass} pass · ${stats.fail} fail · ${stats.manual} manual`
                  : `${QA_CHECKS.filter((row) => row.tab === item.id).length} checks`}
              </p>
            </button>
          )
        })}
      </div>

      <div className="rounded-[16px] border border-line bg-white p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-xl">{tabMeta(tab).label}</h3>
            <p className="text-sm text-muted">
              {tabStats
                ? `${tabStats.pass} passed, ${tabStats.fail} failed, ${tabStats.warn} warnings, ${tabStats.manual} manual`
                : 'Run the suite to fill this tab.'}
            </p>
          </div>
        </div>
        {busy && !results.length ? <Spinner /> : null}
        <div className="space-y-2">
          {(visible.length ? visible : QA_CHECKS.filter((row) => row.tab === tab)).map((row) => (
            <div key={row.id} className={`rounded-2xl border px-3 py-2.5 ${STATUS_STYLES[row.status] || 'border-line bg-paper'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{row.title}</p>
                  <p className="mt-0.5 text-[12px] opacity-80">{row.message || row.detail}</p>
                </div>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.12em]">
                  {statusLabel(row.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
