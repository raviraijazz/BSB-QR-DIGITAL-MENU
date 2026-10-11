import { useMemo, useState } from 'react'
import Button from '../Button'
import Spinner from '../Spinner'
import { QA_CHECKS, QA_TABS, tabMeta } from '../../lib/qaCatalog'
import { downloadQaCsv, downloadQaPdf, downloadQaXlsx } from '../../lib/qaReport'
import { runQaSuite } from '../../lib/qaRunner'
import {
  APP_VERSION,
  DEPLOY_PROVIDER,
  goLiveSummary,
  statusLabel,
} from '../../lib/goLive'

const STATUS_STYLES = {
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  fail: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-950',
  manual: 'border-line bg-paper text-ink',
  skip: 'border-line bg-paper text-muted',
  unchecked: 'border-line bg-white text-muted',
}

const GATE_STYLES = {
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warnings: 'border-amber-200 bg-amber-50 text-amber-950',
  'not-ready': 'border-red-200 bg-red-50 text-red-900',
  verify: 'border-line bg-paper text-ink',
}

const CARD_COPY = {
  deployment: { title: 'Deployment', hint: 'Build mode and hosting provider. No deploy API is connected.' },
  environment: { title: 'Environment', hint: 'Public Vite config only. Secrets are never shown.' },
  database: { title: 'Database', hint: 'Restaurant-scoped schema and integrity checks.' },
  security: { title: 'Security & RLS', hint: 'Owner-scoped reads. RLS is not disabled to pass checks.' },
  readiness: { title: 'Production Readiness', hint: 'Derived from the Phase 19 suite, not a second engine.' },
}

function lastCheckedText(ranAt) {
  if (!ranAt) return 'Not checked'
  try {
    return new Date(ranAt).toLocaleString('en-IN')
  } catch {
    return ranAt
  }
}

function StatusPill({ status }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.12em]">
      {statusLabel(status)}
    </span>
  )
}

function Panel({ title, children, action }) {
  return (
    <section className="rounded-[16px] border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-display text-xl">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/70 py-2 last:border-b-0">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="max-w-[70%] text-right text-sm">{value || '—'}</p>
    </div>
  )
}

export default function SystemReadiness({ restaurant, user }) {
  const [tab, setTab] = useState('features')
  const [panel, setPanel] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: QA_CHECKS.length })
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const live = useMemo(() => goLiveSummary(results, restaurant), [results, restaurant])
  const visible = useMemo(
    () => (results || []).filter((row) => row.tab === tab),
    [results, tab],
  )
  const tabStats = summary?.byTab?.[tab]
  const failed = live.failed
  const gateStyle = GATE_STYLES[live.gate.id] || GATE_STYLES.verify

  async function runAll() {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
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

  function openUrl(url) {
    if (!url) {
      setNotice('No dashboard URL is available in this session.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function showPanel(id) {
    setPanel(id)
    if (id === 'security') setTab('security')
    if (id === 'database') setTab('integrity')
    if (id === 'deployment') setTab('deployment')
    if (id === 'environment') setTab('settings')
  }

  function reviewFailed() {
    if (!results.length) {
      setError('Run the suite before reviewing failed checks.')
      return
    }
    setPanel('failed')
    const failTab = failed[0]?.tab
    if (failTab) setTab(failTab)
  }

  const runtime = live.runtime

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-[12px] text-muted">
          Restaurant-scoped checks only. There is no platform-admin role in this app, so hosting secrets, backups and deploy controls stay in Vercel and Supabase.
        </p>
        <Button onClick={runAll} disabled={busy}>{busy ? `Running ${progress.done}/${progress.total}` : 'Run Full QA Suite'}</Button>
      </div>

      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {['deployment', 'environment', 'database', 'security', 'readiness'].map((id) => {
          const card = live.cards[id]
          const copy = CARD_COPY[id]
          return (
            <div key={id} className={`rounded-[16px] border p-3 ${STATUS_STYLES[card.status] || STATUS_STYLES.unchecked}`}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{copy.title}</p>
              <p className="mt-1 font-display text-xl">{statusLabel(card.status)}</p>
              <p className="mt-1 text-[12px] opacity-80">{copy.hint}</p>
              <p className="mt-2 text-[11px] text-muted">Last checked {lastCheckedText(summary?.ranAt)}</p>
              <button type="button" className="mt-2 text-[12px] underline" onClick={() => showPanel(id)}>View details</button>
            </div>
          )
        })}
      </div>

      <div className={`rounded-[16px] border p-4 ${gateStyle}`}>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Overall system status</p>
        <h3 className="mt-1 font-display text-3xl">{live.gate.label}</h3>
        <p className="mt-1 text-sm">{live.gate.detail}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <p className="text-sm">Checks {live.counts.total || 0}</p>
          <p className="text-sm">Passed {live.counts.pass || 0}</p>
          <p className="text-sm">Failed {live.counts.fail || 0}</p>
          <p className="text-sm">Warnings {live.counts.warn || 0}</p>
          <p className="text-sm">Manual {live.counts.manual || 0}</p>
        </div>
        {busy ? <p className="mt-2 text-[12px] text-muted">Running {progress.done}/{progress.total}</p> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Deployment"
          action={<Button variant="secondary" onClick={() => openUrl(runtime.providerUrl)}>Open {DEPLOY_PROVIDER}</Button>}
        >
          <MetaRow label="Provider" value={DEPLOY_PROVIDER} />
          <MetaRow label="Environment" value={runtime.mode} />
          <MetaRow label="App version" value={runtime.version} />
          <MetaRow label="Production bundle" value={runtime.prod ? 'Yes (this session)' : 'No — this session is the Vite dev server'} />
          <MetaRow label="Commit" value={runtime.commit || 'Not exposed to the browser'} />
          <MetaRow label="Deployed at" value="Manual verification required in Vercel" />
          <p className="mt-3 text-sm text-muted">
            Deploy Latest Build is not available from this app. There is no secure deployment API. Push the git branch and deploy from {DEPLOY_PROVIDER}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openUrl(runtime.providerUrl)}>View deployment logs</Button>
          </div>
        </Panel>

        <Panel title="Environment configuration">
          <MetaRow label="Mode" value={runtime.mode} />
          <MetaRow label="Supabase URL configured" value={runtime.supabaseHostSet ? 'Yes' : 'No'} />
          <MetaRow label="Anon key configured" value={runtime.anonKeySet ? 'Yes' : 'No'} />
          <MetaRow label="Application URL" value={runtime.origin || 'Unknown'} />
          <MetaRow label="Timezone" value={runtime.timezone || 'Not set on this restaurant'} />
          <MetaRow label="Currency" value={runtime.currency} />
          <MetaRow label="Debug mode" value={runtime.debug ? 'On (dev server)' : 'Off'} />
          <p className="mt-3 text-sm text-muted">
            Secret keys are not loaded in the frontend. Edit environment variables in the Vercel project settings, not here.
          </p>
        </Panel>

        <Panel
          title="Database status"
          action={<Button variant="secondary" disabled={busy} onClick={runAll}>Run migration check</Button>}
        >
          <MetaRow label="Connection" value={runtime.supabaseConfigured ? 'Anon client configured' : 'Missing public config'} />
          <MetaRow label="SQL files in repo" value={String(runtime.sqlFiles)} />
          <MetaRow label="Schema checks" value={results.length ? statusLabel(live.cards.database.status) : 'Not checked'} />
          <MetaRow label="RLS" value={results.length ? statusLabel(live.cards.security.status) : 'Not checked'} />
          <p className="mt-3 text-sm text-muted">
            This check queries tables the signed-in owner can already read. It does not prove every migration ran on the remote project, and it never prints credentials or row contents.
          </p>
        </Panel>

        <Panel
          title="Backups & recovery"
          action={<Button variant="secondary" onClick={() => openUrl(runtime.supabaseDashboard)}>Open Supabase</Button>}
        >
          <MetaRow label="Latest verified backup" value="Unknown" />
          <MetaRow label="Backup status" value="Monitoring integration required" />
          <MetaRow label="Retention" value="Configured in Supabase, not in this app" />
          <p className="mt-3 text-sm text-muted">
            Create Manual Backup is disabled. No authorized backup API exists in the browser. Use Supabase dashboard backups or PITR. Restore is never started from this screen.
          </p>
        </Panel>

        <Panel title="Monitoring & alerts">
          <MetaRow label="Uptime" value="Unknown" />
          <MetaRow label="Response time" value={summary?.durationMs ? `Last suite ${summary.durationMs}ms` : 'Unknown'} />
          <MetaRow label="Error rate" value="Unknown" />
          <MetaRow label="Last health check" value={lastCheckedText(summary?.ranAt)} />
          <p className="mt-3 text-sm text-muted">
            Monitoring integration required. No uptime, error-rate or health-check provider is connected. Restaurant-scoped QA timings are the only live latency numbers on this page.
          </p>
        </Panel>

        <Panel
          title="Domain & SSL"
          action={<Button variant="secondary" onClick={() => openUrl(runtime.providerUrl)}>Manage domain settings</Button>}
        >
          <MetaRow label="Host" value={runtime.host || 'Unknown'} />
          <MetaRow label="Protocol" value={runtime.protocol || 'Unknown'} />
          <MetaRow label="HTTPS this session" value={runtime.https ? 'Yes' : 'No'} />
          <MetaRow label="Certificate expiry" value="Not readable from the browser" />
          <p className="mt-3 text-sm text-muted">{runtime.httpsMessage}</p>
        </Panel>
      </div>

      <Panel title="Go live checklist">
        <div className="space-y-2">
          {live.checklist.map((item) => (
            <div key={item.id} className={`rounded-2xl border px-3 py-2.5 ${STATUS_STYLES[item.status] || STATUS_STYLES.unchecked}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-0.5 text-[12px] opacity-80">{item.message || 'Not checked'}</p>
                </div>
                <StatusPill status={item.status} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Quick actions">
        <div className="flex flex-wrap gap-2">
          <Button onClick={runAll} disabled={busy}>Run available checks</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setTab('features'); setPanel('qa') }}>Open Phase 19 QA report</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setTab('security'); runAll() }}>Validate RLS</Button>
          <Button variant="secondary" onClick={() => openUrl(runtime.providerUrl)}>Open deployment provider</Button>
          <Button variant="secondary" onClick={() => openUrl(runtime.supabaseDashboard)}>Open Supabase dashboard</Button>
          <Button variant="secondary" onClick={reviewFailed}>Review failed checks</Button>
          <Button variant="secondary" disabled={busy} onClick={() => requireResults() && downloadQaCsv(restaurant, results, { ...summary, gate: live.gate, counts: live.counts, score: live.score })}>CSV</Button>
          <Button variant="secondary" disabled={busy} onClick={() => requireResults() && downloadQaXlsx(restaurant, results, { ...summary, gate: live.gate, counts: live.counts, score: live.score })}>Excel</Button>
          <Button variant="secondary" disabled={busy} onClick={() => requireResults() && downloadQaPdf(restaurant, results, { ...summary, gate: live.gate, counts: live.counts, score: live.score }).catch((next) => setError(next?.message || 'Unable to download PDF.'))}>PDF</Button>
        </div>
      </Panel>

      <Panel title="System information">
        <MetaRow label="Application version" value={APP_VERSION} />
        <MetaRow label="Environment name" value={runtime.mode} />
        <MetaRow label="Selected restaurant" value={runtime.restaurantName || 'None'} />
        <MetaRow label="Timezone / currency" value={`${runtime.timezone || '—'} / ${runtime.currency}`} />
        <MetaRow label="Public config" value={runtime.supabaseConfigured ? 'URL and anon key present' : 'Incomplete'} />
        <p className="mt-3 text-[12px] text-muted">Restaurant settings are scoped to the selected restaurant. Hosting, backups and SSL are platform infrastructure and are not editable here.</p>
      </Panel>

      {panel === 'failed' && failed.length ? (
        <Panel title="Failed checks">
          <div className="space-y-2">
            {failed.map((row) => (
              <div key={row.id} className={`rounded-2xl border px-3 py-2.5 ${STATUS_STYLES.fail}`}>
                <p className="text-sm font-medium">{row.title}</p>
                <p className="mt-0.5 text-[12px]">{row.message}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

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
                <StatusPill status={row.status || 'unchecked'} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
