import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import SessionWarningModal from '../../components/SessionWarningModal'
import { formatDateTime } from '../../lib/platformAdmin'
import {
  DEFAULT_POLICIES,
  IDLE_MINUTE_OPTIONS,
  LIFETIME_HOUR_OPTIONS,
  SESSION_ROLE_LABELS,
  SESSION_ROLES,
  WARNING_SECOND_OPTIONS,
  clonePolicies,
  formatDurationMinutes,
  policiesFromRows,
  sessionStatusLabel,
  validatePolicies,
} from '../../lib/sessionPolicy'
import {
  getSessionPolicies,
  listAppSessions,
  revokeAppSession,
  revokeUserSessions,
  setSessionPolicies,
} from '../../services/platformAdmin'

const STATUS_CLASS = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  locked: 'bg-sky-50 text-sky-700 border-sky-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  revoked: 'bg-red-50 text-red-700 border-red-200',
}

function RoleCard({ role, form, setForm }) {
  function set(key, value) {
    setForm((current) => ({
      ...current,
      [role]: { ...current[role], [key]: value },
    }))
  }
  const row = form[role]
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-medium text-slate-800">{SESSION_ROLE_LABELS[role]}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-500">
          Idle timeout
          <select
            value={row.idle_minutes}
            onChange={(e) => set('idle_minutes', Number(e.target.value))}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
          >
            {IDLE_MINUTE_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDurationMinutes(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Maximum lifetime
          <select
            value={row.max_lifetime_hours}
            onChange={(e) => set('max_lifetime_hours', Number(e.target.value))}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
          >
            {LIFETIME_HOUR_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                {hours} hour{hours === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Warning interval
          <select
            value={row.warning_seconds}
            onChange={(e) => set('warning_seconds', Number(e.target.value))}
            disabled={!row.warning_enabled}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
          >
            {WARNING_SECOND_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds / 60} min
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={row.warning_enabled}
            onChange={(e) => set('warning_enabled', e.target.checked)}
          />
          Show warning before idle expiry
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={row.auto_logout_enabled}
            onChange={(e) => set('auto_logout_enabled', e.target.checked)}
          />
          Auto-logout when idle or lifetime ends
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={row.shared_device_lock}
            onChange={(e) => set('shared_device_lock', e.target.checked)}
          />
          Shared-device lock on idle
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={row.preserve_unsaved}
            onChange={(e) => set('preserve_unsaved', e.target.checked)}
          />
          Preserve unsaved restaurant work in the browser when possible
        </label>
      </div>
    </div>
  )
}

export default function PlatformAdminSessions() {
  const [saved, setSaved] = useState(clonePolicies())
  const [form, setForm] = useState(clonePolicies())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [policyResult, sessionResult] = await Promise.all([getSessionPolicies(), listAppSessions()])
    if (policyResult.error || sessionResult.error) {
      setError(policyResult.error?.message || sessionResult.error?.message || 'Could not load session settings.')
      setLoading(false)
      return
    }
    const next = policiesFromRows(policyResult.data || [])
    setSaved(next)
    setForm(next)
    setRows(sessionResult.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onSave(event) {
    event.preventDefault()
    const validation = validatePolicies(form)
    if (validation) {
      setError(validation)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    const { data, error: nextError } = await setSessionPolicies(form)
    setSaving(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    const next = policiesFromRows(data || [])
    setSaved(next)
    setForm(next)
    setNotice('Session policies saved. Changes apply immediately to existing sessions.')
    load()
  }

  async function terminate(row) {
    setBusyId(row.id)
    setError('')
    const { error: nextError } = await revokeAppSession(row.id, 'founder terminated this session')
    setBusyId('')
    if (nextError) {
      setError(nextError.message)
      return
    }
    setNotice('That session was revoked. Protected access is denied until the user signs in again.')
    load()
  }

  async function terminateAccount(row) {
    setBusyId(`user:${row.user_id}`)
    setError('')
    const { error: nextError } = await revokeUserSessions(row.user_id, 'founder revoked every session for this account')
    setBusyId('')
    if (nextError) {
      setError(nextError.message)
      return
    }
    setNotice('Every live session for that account was revoked.')
    load()
  }

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Session Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Idle timeout and maximum lifetime are separate. Meaningful clicks, keys and navigation reset inactivity only.
          Policy changes apply immediately to existing sessions.
        </p>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <form onSubmit={onSave} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Role policies</h2>
            <p className="mt-1 text-xs text-slate-400">Founder-only. Defaults: Founder 15m/8h, Owner 30m/12h, Waiter 15m/8h.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setPreviewOpen(true)}>
            Preview warning
          </Button>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {SESSION_ROLES.map((role) => (
            <RoleCard key={role} role={role} form={form} setForm={setForm} />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || saving}
            onClick={() => setForm(clonePolicies(saved))}
          >
            Cancel
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save policies'}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Active sessions</h2>
        <p className="mt-1 text-xs text-slate-400">
          Terminate session ends one browser login. Revoke account ends every live session for that user. Tokens are not stored here.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Loading sessions…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No session records yet" body="Users appear here after they sign in following the session SQL migration." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Restaurant</th>
                  <th className="px-3 py-2 font-medium">Login</th>
                  <th className="px-3 py-2 font-medium">Last activity</th>
                  <th className="px-3 py-2 font-medium">Idle expiry</th>
                  <th className="px-3 py-2 font-medium">Absolute expiry</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{row.display_name || 'User'}</p>
                      <p className="text-xs text-slate-400">{String(row.user_agent || '').slice(0, 48)}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{SESSION_ROLE_LABELS[row.role] || row.role}</td>
                    <td className="px-3 py-3 text-slate-600">{row.restaurant_name || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{formatDateTime(row.started_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{formatDateTime(row.last_activity_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{formatDateTime(row.idle_expires_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{formatDateTime(row.absolute_expires_at)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[row.status] || STATUS_CLASS.active}`}>
                        {sessionStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.status === 'revoked' || row.status === 'expired' ? (
                        <span className="text-xs text-slate-400">No action</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="text-left text-sm text-blue-700 hover:underline"
                            disabled={busyId === row.id}
                            onClick={() => terminate(row)}
                          >
                            {busyId === row.id ? 'Ending…' : 'Terminate session'}
                          </button>
                          <button
                            type="button"
                            className="text-left text-sm text-red-700 hover:underline"
                            disabled={busyId === `user:${row.user_id}`}
                            onClick={() => terminateAccount(row)}
                          >
                            {busyId === `user:${row.user_id}` ? 'Revoking…' : 'Revoke account'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SessionWarningModal
        open={previewOpen}
        remainingMs={DEFAULT_POLICIES.founder.warning_seconds * 1000}
        sharedDevice={false}
        onContinue={() => setPreviewOpen(false)}
        onSignOut={() => setPreviewOpen(false)}
      />
    </div>
  )
}
