import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Field, { inputClass } from '../../components/Field'
import { formatDateTime } from '../../lib/platformAdmin'
import {
  DEFAULT_PUBLIC_SETTINGS,
  SETTING_EFFECTS,
  adminSettingsFromPayload,
  buildSettingsPayload,
  cloneSettings,
  highImpactWarnings,
  resettableDefaults,
  validateSettings,
} from '../../lib/platformSettings'
import { getPlatformSettings, setPlatformSettings } from '../../services/platformAdmin'

const emptyAdmin = adminSettingsFromPayload(DEFAULT_PUBLIC_SETTINGS)

function ConfirmDialog({ open, warnings, onCancel, onConfirm, busy }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Confirm change</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">This change takes effect immediately</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
          {warnings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving...' : 'Save anyway'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformAdminSettings() {
  const [saved, setSaved] = useState(emptyAdmin)
  const [form, setForm] = useState(emptyAdmin)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingWarnings, setPendingWarnings] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: nextError } = await getPlatformSettings()
    if (nextError) {
      setError(nextError.message)
      setLoading(false)
      return
    }
    const next = adminSettingsFromPayload(data)
    setSaved(next)
    setForm(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function persist() {
    const validation = validateSettings(form)
    if (validation) {
      setError(validation)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    const { data, error: nextError } = await setPlatformSettings(buildSettingsPayload(form))
    setSaving(false)
    setPendingWarnings([])
    if (nextError) {
      setError(nextError.message)
      return
    }
    const next = adminSettingsFromPayload(data)
    setSaved(next)
    setForm(next)
    setNotice('Global settings saved. Changes apply immediately.')
  }

  function onSubmit(event) {
    event.preventDefault()
    const validation = validateSettings(form)
    if (validation) {
      setError(validation)
      return
    }
    const warnings = highImpactWarnings(saved, form)
    if (warnings.length) {
      setPendingWarnings(warnings)
      return
    }
    persist()
  }

  const dirty = useMemo(() => JSON.stringify(buildSettingsPayload(form)) !== JSON.stringify(buildSettingsPayload(saved)), [form, saved])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Global Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform identity, owner registration, and maintenance. Restaurant branding, plan defaults, and session
          timeouts stay on their own pages.
        </p>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      {loading ? (
        <p className="text-sm text-slate-400">Loading settings...</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform identity</h2>
            <p className="mt-1 text-xs text-slate-400">{SETTING_EFFECTS.identity}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Display name">
                <input className={inputClass} value={form.display_name} onChange={(e) => set('display_name', e.target.value)} />
              </Field>
              <Field label="Support email">
                <input className={inputClass} value={form.support_email} onChange={(e) => set('support_email', e.target.value)} />
              </Field>
              <Field label="Support phone">
                <input className={inputClass} value={form.support_phone} onChange={(e) => set('support_phone', e.target.value)} />
              </Field>
              <Field label="WhatsApp number" hint="Digits only. Used for wa.me links.">
                <input className={inputClass} value={form.support_whatsapp} onChange={(e) => set('support_whatsapp', e.target.value)} />
              </Field>
              <Field label="Support hours" hint="Optional. Shown on the public contact section.">
                <input className={inputClass} value={form.support_hours} onChange={(e) => set('support_hours', e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Tagline">
                  <input className={inputClass} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
                </Field>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Logo and restaurant branding stay in each restaurant profile. This page does not upload platform assets.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Registration</h2>
            <p className="mt-1 text-xs text-slate-400">{SETTING_EFFECTS.registration}</p>
            <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.registration_enabled}
                onChange={(e) => set('registration_enabled', e.target.checked)}
              />
              <span>
                Allow new restaurant owner registrations
                <span className="mt-1 block text-xs text-slate-400">
                  Existing owner and waiter logins are never blocked by this switch. Default plan assignment stays in
                  Subscription &amp; Plans.
                </span>
              </span>
            </label>
            <div className="mt-4">
              <Field label="Closed-registration message" hint="Shown on /signup when registrations are closed.">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.registration_message}
                  onChange={(e) => set('registration_message', e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Maintenance</h2>
            <p className="mt-1 text-xs text-slate-400">{SETTING_EFFECTS.maintenance}</p>
            <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.maintenance_enabled}
                onChange={(e) => set('maintenance_enabled', e.target.checked)}
              />
              <span>
                Enable maintenance mode
                <span className="mt-1 block text-xs text-slate-400">
                  Blocks owner dashboards and waiter POS server-side. Guest QR menus and this Founder Console remain
                  available so you can turn it off.
                </span>
              </span>
            </label>
            <div className="mt-4">
              <Field label="Maintenance message">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.maintenance_message}
                  onChange={(e) => set('maintenance_message', e.target.value)}
                />
              </Field>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs text-slate-400">
              {saved.updated_at
                ? `Last changed ${formatDateTime(saved.updated_at)}${saved.updated_by_username ? ` by ${saved.updated_by_username}` : ''}.`
                : 'No founder edits recorded yet.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setForm(cloneSettings(resettableDefaults()))}
              >
                Reset to defaults
              </Button>
              <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setForm(cloneSettings(saved))}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving || !dirty}>
                {saving ? 'Saving...' : 'Save settings'}
              </Button>
            </div>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={pendingWarnings.length > 0}
        warnings={pendingWarnings}
        busy={saving}
        onCancel={() => setPendingWarnings([])}
        onConfirm={persist}
      />
    </div>
  )
}
