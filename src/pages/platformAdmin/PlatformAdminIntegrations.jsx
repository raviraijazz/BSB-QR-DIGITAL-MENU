import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import { formatDateTime } from '../../lib/platformAdmin'
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATUSES,
  activityForProvider,
  deriveIntegrationStatus,
  filterProviders,
  logsState,
  providerById,
  safeErrorMessage,
  validateSheetTestUrl,
} from '../../lib/platformIntegrations'
import { SAMPLE_SHEET_URL } from '../../lib/menuImport'
import { fetchSheet, listIntegrationActivity, recordIntegrationTest } from '../../services/platformAdmin'

function StatusBadge({ status }) {
  const meta = INTEGRATION_STATUSES[status] || INTEGRATION_STATUSES.not_implemented
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function activityMessage(row) {
  if (!row) return '—'
  if (row.message) return row.message
  if (row.action === 'menu_import') return 'Menu imported'
  return row.ok ? 'Connection test succeeded' : 'Connection test failed'
}

export default function PlatformAdminIntegrations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('provider') || ''
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [logsError, setLogsError] = useState('')
  const [logsLoaded, setLogsLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [testUrl, setTestUrl] = useState(SAMPLE_SHEET_URL)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLogsError('')
    const { data, error: nextError } = await listIntegrationActivity({ limit: 50 })
    if (nextError) {
      setLogsError(nextError.message)
      setActivity([])
      setLogsLoaded(true)
      setLoading(false)
      return
    }
    setActivity(Array.isArray(data) ? data : [])
    setLogsLoaded(true)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const logsUnavailable = logsLoaded && Boolean(logsError)

  const cards = useMemo(() => {
    return INTEGRATION_PROVIDERS.map((provider) => {
      const { lastSuccess, lastError } = activityForProvider(provider, activity)
      const status = deriveIntegrationStatus(provider, { lastSuccess, lastError, logsUnavailable })
      return { provider, lastSuccess, lastError, status }
    })
  }, [activity, logsUnavailable])

  const statusMap = useMemo(
    () => Object.fromEntries(cards.map((row) => [row.provider.id, row.status])),
    [cards],
  )

  const visible = useMemo(
    () => filterProviders(INTEGRATION_PROVIDERS, { search, category, statusMap }),
    [search, category, statusMap],
  )

  const selected = providerById(selectedId)
  const selectedCard = cards.find((row) => row.provider.id === selectedId) || null
  const selectedActivity = selected ? activityForProvider(selected, activity).rows : []
  const logState = logsState({ error: logsError, loaded: logsLoaded, rows: selected ? selectedActivity : activity })

  function openProvider(id) {
    setError('')
    setNotice('')
    setSearchParams(id ? { provider: id } : {})
  }

  async function onTestSheet() {
    const validation = validateSheetTestUrl(testUrl)
    if (validation) {
      setNotice('')
      setError(validation)
      return
    }
    setTesting(true)
    setError('')
    setNotice('')
    const { data, error: fetchError } = await fetchSheet(testUrl.trim())
    const ok = !fetchError && Array.isArray(data?.rows) && data.rows.length > 0
    const message = fetchError
      ? safeErrorMessage(fetchError)
      : ok
        ? `Loaded ${data.rows.length} rows from the public sheet.`
        : 'The sheet appears to be empty.'
    const rowCount = ok ? data.rows.length : null
    await recordIntegrationTest({
      provider: 'google_sheets',
      ok,
      message,
      rowCount,
    })
    setTesting(false)
    if (!ok) {
      setError(message)
    } else {
      setNotice(message)
    }
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Provider status from this project&apos;s real capabilities. Google Sheets/CSV import already exists.
          Other providers stay Not implemented until a server-side integration and secrets exist.
        </p>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>
      {logsUnavailable ? (
        <Alert type="info">
          Integration activity could not be loaded. Status below does not invent a connection. Run
          supabase/platform-integrations.sql if this RPC is missing.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-500">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Provider, purpose, status"
            className="mt-1 block w-64 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {INTEGRATION_CATEGORIES.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setCategory(row.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                category === row.id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {row.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          Loading integrations...
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title="No providers match" body="Clear the search or category filter to see the catalog." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((provider) => {
            const card = cards.find((row) => row.provider.id === provider.id)
            return (
              <article key={provider.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{provider.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{provider.purpose}</p>
                  </div>
                  <StatusBadge status={card?.status} />
                </div>
                <dl className="mt-4 grid gap-2 text-xs text-slate-500">
                  <div className="flex justify-between gap-3">
                    <dt>Last successful activity</dt>
                    <dd className="text-right text-slate-700">
                      {card?.lastSuccess ? formatDateTime(card.lastSuccess.created_at) : logsUnavailable ? 'Unknown' : 'None recorded'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Last error</dt>
                    <dd className="text-right text-slate-700">
                      {card?.lastError ? formatDateTime(card.lastError.created_at) : logsUnavailable ? 'Unknown' : 'None recorded'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {provider.existingRoute ? (
                    <Link
                      to={provider.existingRoute}
                      className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Configure
                    </Link>
                  ) : (
                    <Button variant="secondary" onClick={() => openProvider(provider.id)}>
                      Configure
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => openProvider(provider.id)}>
                    {provider.testable ? 'Test connection' : 'Documentation'}
                  </Button>
                  <Button variant="ghost" onClick={() => openProvider(provider.id)}>
                    View logs
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {selected && selectedCard ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Provider</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{selected.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{selected.purpose}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedCard.status} />
              <Button variant="ghost" onClick={() => openProvider('')}>
                Close
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-slate-800">Configuration</h3>
              {selected.implemented ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {selected.instructions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Not implemented in this repository. Status is never shown as connected.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {selected.instructions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {selected.remaining?.length ? (
                    <>
                      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Still required</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                        {selected.remaining.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {selected.secretsRequired?.length ? (
                    <p className="mt-3 text-xs text-slate-400">
                      If this provider is added later, store {selected.secretsRequired.join(', ')} as Edge Function
                      secrets in the Supabase Dashboard. Never paste them into this page.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-800">Connection test</h3>
              {selected.testable ? (
                <div className="mt-2 space-y-3">
                  <p className="text-sm text-slate-500">
                    Fetches a public CSV export through the existing platform-admin Edge Function. Private sheets
                    fail with a share error. No Google credentials are stored or displayed.
                  </p>
                  <label className="block text-xs font-medium text-slate-500">
                    Google Sheets URL
                    <input
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button className="bg-blue-600 hover:bg-blue-700" onClick={onTestSheet} disabled={testing}>
                      {testing ? 'Testing...' : 'Test public sheet'}
                    </Button>
                    <Link
                      to={selected.existingRoute}
                      className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Continue to import
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  No connection test is available. A test would claim a provider is live without a server-side
                  implementation.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-slate-800">Activity</h3>
            {logState === 'loading' ? (
              <p className="mt-2 text-sm text-slate-400">Loading activity...</p>
            ) : logState === 'unavailable' ? (
              <p className="mt-2 text-sm text-slate-500">
                Activity logging is unavailable. This is not the same as zero failures.
              </p>
            ) : selectedActivity.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No recorded activity for this provider yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">When</th>
                      <th className="px-4 py-2 font-medium">Event</th>
                      <th className="px-4 py-2 font-medium">Result</th>
                      <th className="px-4 py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedActivity.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-500">{formatDateTime(row.created_at)}</td>
                        <td className="px-4 py-2 text-slate-700">{row.action === 'menu_import' ? 'Menu import' : 'Connection test'}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={row.ok ? 'connected' : 'error'} />
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {activityMessage(row)}
                          {row.restaurant_name ? ` · ${row.restaurant_name}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
