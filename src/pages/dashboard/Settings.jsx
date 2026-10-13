import { Component, useEffect, useMemo, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import SettingsPreview from '../../components/settings/SettingsPreview'
import SystemReadiness from '../../components/settings/SystemReadiness'
import {
  AdvancedFields,
  BillFields,
  BrandingFields,
  DiscountFields,
  FloorFields,
  KitchenFields,
  KotFields,
  NotificationFields,
  OrdersFields,
  PaymentFields,
  PermissionFields,
  PrinterFields,
  ProfileFields,
  QrFields,
  SecurityFields,
  TaxFields,
  WaiterPrefFields,
} from '../../components/settings/SettingsFields'
import { useAuth } from '../../hooks/useAuth'
import { authEmailFromUsername, friendlyAuthError, validateOwnerPasswordReset } from '../../lib/auth'
import { menuUrl } from '../../lib/menuUrl'
import { POS_PRINTING_SETTINGS_PATH } from '../../lib/tableWiseNav'
import {
  ALL_SECTIONS,
  MORE_SECTIONS,
  PRIMARY_SECTIONS,
  cloneSettings,
  emptySettings,
  sectionDefaults,
  settingsEqual,
  validateSettings,
} from '../../lib/restaurantSettings'
import { supabase } from '../../lib/supabase'
import { resetOwnerPassword } from '../../services/ownerAuth'
import { uploadAsset } from '../../lib/upload'
import { updateSlug } from '../../services/restaurants'
import { loadRestaurantSettings, saveRestaurantSettings } from '../../services/restaurantSettings'

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fallback below */
  }
  try {
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.left = '-9999px'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(field)
    return ok
  } catch {
    return false
  }
}

function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword) return 'Current password required'
  if (!newPassword) return 'New password required'
  if (newPassword.length < 6) return 'Password too short'
  if (newPassword !== confirmPassword) return 'Passwords do not match'
  if (currentPassword === newPassword) return 'New password must be different'
  return ''
}

function PasswordModal({ open, onClose, username, onSuccess }) {
  const [mode, setMode] = useState('change')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const resetMode = mode === 'reset'

  useEffect(() => {
    if (!open) return
    setMode('change')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setError('')
    setBusy(false)
  }, [open])

  if (!open) return null

  function clearFields() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setError('')
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (resetMode) {
      const validation = validateOwnerPasswordReset({ newPassword, confirmPassword })
      if (validation) {
        setError(validation)
        return
      }
      setBusy(true)
      setError('')
      const { error: resetError } = await resetOwnerPassword({ newPassword, confirmPassword })
      setBusy(false)
      if (resetError) {
        setError(resetError.message)
        return
      }
      onSuccess()
      return
    }
    const validation = validatePasswordChange({ currentPassword, newPassword, confirmPassword })
    if (validation) {
      setError(validation)
      return
    }
    if (!username) {
      setError('Account username missing. Sign in again and retry.')
      return
    }
    setBusy(true)
    setError('')
    const { error: checkError } = await supabase.auth.signInWithPassword({
      email: authEmailFromUsername(username),
      password: currentPassword,
    })
    if (checkError) {
      setBusy(false)
      setError(friendlyAuthError(checkError))
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setBusy(false)
    if (updateError) {
      setError(friendlyAuthError(updateError))
      return
    }
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <button type="button" className="absolute inset-0" aria-label="Close change password" onClick={onClose} />
      <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
        <h2 id="change-password-title" className="font-display text-xl">{resetMode ? 'Reset Password' : 'Change Password'}</h2>
        {resetMode ? (
          <p className="mt-1 text-sm text-muted">Set a new password for this signed-in owner account. The current password is not required.</p>
        ) : null}
        <div className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          {resetMode ? null : (
            <Field label="Current Password">
              <input className={inputClass} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
          )}
          <Field label="New Password">
            <input className={inputClass} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <Field label="Confirm New Password">
            <input className={inputClass} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Show password
          </label>
        </div>
        {resetMode ? null : (
          <button
            type="button"
            className="mt-3 text-sm text-forest underline-offset-2 hover:underline"
            onClick={() => {
              setMode('reset')
              clearFields()
            }}
            disabled={busy}
          >
            Forgot your current password?
          </button>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (resetMode) {
                setMode('change')
                clearFields()
                return
              }
              onClose()
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (resetMode ? 'Resetting...' : 'Updating...') : resetMode ? 'Reset Password' : 'Update Password'}
          </Button>
        </div>
      </form>
    </div>
  )
}

const SHOW_PREVIEW = new Set(['profile', 'branding', 'tax', 'payments', 'kot', 'bill'])

const POS_SECTION_IDS = ['orders', 'floor', 'kitchen', 'waiters', 'permissions', 'kot', 'bill', 'printers', 'payments', 'tax', 'discounts']
const POS_SECTIONS = POS_SECTION_IDS.map((id) => ALL_SECTIONS.find((item) => item.id === id)).filter(Boolean)

class SettingsCrashGuard extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="space-y-3">
          <Alert>{this.state.error?.message || 'Unable to render these settings. Please try again.'}</Alert>
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>Retry</Button>
        </div>
      )
    }
    return this.props.children
  }
}

function sectionBody(section, props) {
  if (section === 'profile') return <ProfileFields {...props} />
  if (section === 'branding') return <BrandingFields {...props} />
  if (section === 'tax') return <TaxFields {...props} />
  if (section === 'payments') return <PaymentFields {...props} />
  if (section === 'kot') return <KotFields {...props} />
  if (section === 'bill') return <BillFields {...props} />
  if (section === 'printers') return <PrinterFields {...props} />
  if (section === 'permissions') return <PermissionFields {...props} />
  if (section === 'qr') return <QrFields {...props} />
  if (section === 'orders') return <OrdersFields {...props} />
  if (section === 'floor') return <FloorFields {...props} />
  if (section === 'kitchen') return <KitchenFields {...props} />
  if (section === 'discounts') return <DiscountFields {...props} />
  if (section === 'waiters') return <WaiterPrefFields {...props} />
  if (section === 'notifications') return <NotificationFields {...props} />
  if (section === 'security') return <SecurityFields {...props} />
  if (section === 'advanced') return <AdvancedFields {...props} />
  if (section === 'readiness') return <SystemReadiness restaurant={props.restaurant} user={props.user} />
  return <p className="text-sm text-muted">This settings section is not available.</p>
}

function SettingsPage() {
  const { user, restaurant, loading, setRestaurant } = useOutletContext()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const fromTableWise = pathname === POS_PRINTING_SETTINGS_PATH || pathname.startsWith(`${POS_PRINTING_SETTINGS_PATH}/`)
  const navSections = fromTableWise ? POS_SECTIONS : PRIMARY_SECTIONS
  const [slugInput, setSlugInput] = useState(restaurant?.slug || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [section, setSection] = useState(() => (
    pathname === POS_PRINTING_SETTINGS_PATH || pathname.startsWith(`${POS_PRINTING_SETTINGS_PATH}/`) ? 'orders' : 'profile'
  ))
  const [moreOpen, setMoreOpen] = useState(false)
  const [previewTab, setPreviewTab] = useState('bill')
  const [form, setForm] = useState(() => emptySettings(restaurant, user))
  const [saved, setSaved] = useState(() => emptySettings(restaurant, user))
  const [loadBusy, setLoadBusy] = useState(false)
  const [loadKey, setLoadKey] = useState(0)
  const [fieldErrors, setFieldErrors] = useState({})
  const [navOpen, setNavOpen] = useState(false)

  const username = user?.user_metadata?.username || ''
  const contact = user?.user_metadata?.contact_number || ''
  const url = restaurant?.slug ? menuUrl(restaurant.slug) : ''
  const dirty = useMemo(() => !settingsEqual(form, saved), [form, saved])
  const blocker = useBlocker(dirty)
  const currentSection = ALL_SECTIONS.find((item) => item.id === section) || navSections[0] || PRIMARY_SECTIONS[0]

  useEffect(() => {
    setSection(fromTableWise ? 'orders' : 'profile')
    setMoreOpen(false)
  }, [fromTableWise])

  useEffect(() => {
    setSlugInput(restaurant?.slug || '')
  }, [restaurant?.id, restaurant?.slug])

  useEffect(() => {
    if (section === 'bill') setPreviewTab('bill')
    if (section === 'kot') setPreviewTab('kot')
  }, [section])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    function onLeave(event) {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  useEffect(() => {
    if (!restaurant?.id) {
      setForm(emptySettings(null, user))
      setSaved(emptySettings(null, user))
      setError('')
      setLoadBusy(false)
      return undefined
    }
    let active = true
    setLoadBusy(true)
    setError('')
    setForm(emptySettings(restaurant, user))
    setSaved(emptySettings(restaurant, user))
    loadRestaurantSettings(restaurant, user)
      .then((result) => {
        if (!active) return
        if (result.error) {
          setError(result.error.message)
          setLoadBusy(false)
          return
        }
        const next = result.data || emptySettings(restaurant, user)
        setForm(cloneSettings(next))
        setSaved(cloneSettings(next))
        setFieldErrors({})
        setNotice('')
        setLoadBusy(false)
      })
      .catch(() => {
        if (!active) return
        setError('Unable to load restaurant settings. Please try again.')
        setLoadBusy(false)
      })
    return () => {
      active = false
    }
  }, [restaurant?.id, loadKey])

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onUpload(event, key, path) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !user?.id) return
    const { url: uploaded, error: uploadError } = await uploadAsset(user.id, file, path)
    if (uploadError) setError(uploadError)
    else set(key, uploaded)
  }

  async function onSave() {
    if (!restaurant || saving) return
    const nextErrors = validateSettings(form)
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setError('Please correct the highlighted fields.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    const result = await saveRestaurantSettings(user.id, restaurant, form)
    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (result.restaurant) setRestaurant(result.restaurant)
    const next = result.data || form
    setForm(cloneSettings(next))
    setSaved(cloneSettings(next))
    setNotice('Restaurant settings saved.')
    setToast('Settings saved')
  }

  function onCancel() {
    setForm(cloneSettings(saved))
    setFieldErrors({})
    setError('')
    setNotice('')
  }

  function onResetSection() {
    setForm((current) => ({ ...current, ...sectionDefaults(section, restaurant, user) }))
  }

  async function onSlug(event) {
    event.preventDefault()
    if (!restaurant) return
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error: nextError } = await updateSlug(restaurant.id, user.id, slugInput || restaurant.name)
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setRestaurant(data)
    setSlugInput(data.slug)
    setNotice('Menu URL updated. Download a new QR if you already printed one.')
  }

  async function copyUrl() {
    if (!url) return
    const ok = await copyText(url)
    setToast(ok ? 'Menu URL copied' : 'Could not copy the URL.')
  }

  async function onSignOut() {
    if (dirty && !window.confirm('You have unsaved restaurant settings. Sign out anyway?')) return
    await signOut()
    navigate('/')
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Select a restaurant"
        body={fromTableWise
          ? 'POS & Printing Settings are scoped to the restaurant you select.'
          : 'Restaurant Settings are scoped to the restaurant you select.'}
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  const fieldProps = {
    form,
    set,
    errors: fieldErrors,
    restaurant,
    onLogo: (event) => onUpload(event, 'logo_url', `logo-${restaurant.id}`),
    onMark: (event) => onUpload(event, 'mark_url', `mark-${restaurant.id}`),
    onRemoveLogo: () => set('logo_url', ''),
    onRemoveMark: () => set('mark_url', ''),
    user,
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">
            <Link to="/dashboard" className="hover:text-ink">Dashboard</Link>
            {fromTableWise ? (
              <>
                <span className="px-1.5">›</span>
                <Link to="/dashboard/table-wise" className="hover:text-ink">TABLE-WISE ORDER</Link>
              </>
            ) : null}
            <span className="px-1.5">›</span>
            <span className="text-ink">{fromTableWise ? 'POS & Printing Settings' : 'Restaurant Settings'}</span>
          </p>
          <h1 className="mt-1 font-display text-3xl leading-tight">
            {fromTableWise ? 'POS & Printing Settings' : 'Global Restaurant Settings'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {fromTableWise
              ? 'Configure orders, kitchen, KOT, bills, printers, payments and waiter permissions for this restaurant.'
              : 'Configure your restaurant settings, branding, tax, payment, KOT, bill and more. Changes here will be applied across your restaurant.'}
          </p>
          <p className="mt-1 text-sm font-medium">{restaurant.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="lg:hidden" onClick={() => setNavOpen((open) => !open)}>Sections</Button>
          {section !== 'readiness' ? (
            <>
              <Button variant="secondary" disabled={!dirty || saving} onClick={onCancel}>Cancel</Button>
              <Button variant="secondary" disabled={saving} onClick={onResetSection}>Reset section</Button>
              <Button disabled={!dirty || saving} onClick={onSave}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <Alert>{error}</Alert>
          </div>
          <Button variant="secondary" disabled={loadBusy} onClick={() => setLoadKey((n) => n + 1)}>Retry</Button>
        </div>
      ) : null}
      <Alert type="success">{notice}</Alert>
      {dirty ? <Alert type="info">You have unsaved changes for {restaurant.name}.</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(18rem,22rem)] lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className={`${navOpen ? 'block' : 'hidden'} rounded-[18px] border border-line bg-card p-3 shadow-sm lg:block`}>
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            {fromTableWise ? 'POS & Printing' : 'Settings'}
          </p>
          {navSections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setSection(item.id); setNavOpen(false) }}
              className={`mb-0.5 flex w-full rounded-xl px-3 py-2 text-left text-sm ${section === item.id ? 'bg-forest text-[#f5ead8]' : 'text-ink hover:bg-paper'}`}
            >
              {item.label}
            </button>
          ))}
          {!fromTableWise ? (
            <>
              <button type="button" className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-paper" onClick={() => setMoreOpen((open) => !open)}>
                More
              </button>
              {moreOpen ? MORE_SECTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setSection(item.id); setNavOpen(false) }}
                  className={`mb-0.5 flex w-full rounded-xl px-3 py-2 text-left text-sm ${section === item.id ? 'bg-forest text-[#f5ead8]' : 'text-ink hover:bg-paper'}`}
                >
                  {item.label}
                </button>
              )) : null}
            </>
          ) : null}
        </nav>

        <section className="min-w-0 rounded-[18px] border border-line bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">{section === 'readiness' ? 'Production Environment & Go Live' : currentSection.label}</h2>
              <p className="mt-1 text-sm text-muted">
                {section === 'readiness'
                  ? 'Verify deployment, security, system health and launch readiness.'
                  : `Settings for ${restaurant.name}. Saved values stay restaurant-scoped.`}
              </p>
            </div>
          </div>
          {loadBusy ? <Spinner /> : (
            <SettingsCrashGuard>
              {sectionBody(section, fieldProps)}
            </SettingsCrashGuard>
          )}
        </section>

        {SHOW_PREVIEW.has(section) ? (
          <div className="hidden xl:block">
            <SettingsPreview form={form} tab={previewTab} onTab={setPreviewTab} />
          </div>
        ) : null}
      </div>

      {SHOW_PREVIEW.has(section) ? (
        <div className="xl:hidden">
          <SettingsPreview form={form} tab={previewTab} onTab={setPreviewTab} />
        </div>
      ) : null}

      {fromTableWise ? null : (
      <>
      <Card title="Public Menu" compact>
        <p className="break-all text-sm text-ink">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={copyUrl}>Copy URL</Button>
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="secondary">Open Menu</Button>
          </a>
        </div>
        <form onSubmit={onSlug} className="mt-5 space-y-3 border-t border-line pt-4">
          <Field
            label="Menu Slug"
            hint="Changing the slug changes your public menu URL. Existing printed QR codes and shared links may stop working."
          >
            <input className={inputClass} value={slugInput} onChange={(e) => setSlugInput(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Update Slug'}</Button>
        </form>
      </Card>

      <Card title="Account" compact>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Username</p>
            <p className="mt-1 text-sm text-ink">{username || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Contact Number</p>
            <p className="mt-1 text-sm text-ink">{contact || '—'}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPasswordOpen(true)}>Change Password</Button>
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <Button variant="secondary" onClick={onSignOut}>Sign Out</Button>
        </div>
      </Card>
      </>
      )}

      {blocker.state === 'blocked' ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="unsaved-settings-title">
          <button type="button" className="absolute inset-0" aria-label="Stay on settings" onClick={() => blocker.reset()} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
            <h2 id="unsaved-settings-title" className="font-display text-xl">Unsaved changes</h2>
            <p className="mt-2 text-sm text-muted">You have unsaved restaurant settings for {restaurant.name}. Leave this page anyway?</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => blocker.reset()}>Stay</Button>
              <Button type="button" onClick={() => blocker.proceed()}>Leave</Button>
            </div>
          </div>
        </div>
      ) : null}

      <PasswordModal
        open={passwordOpen}
        username={username}
        onClose={() => setPasswordOpen(false)}
        onSuccess={() => {
          setPasswordOpen(false)
          setToast('Password updated successfully')
        }}
      />

      {toast ? (
        <p
          role="status"
          className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-3.5 py-2 text-xs font-medium text-[#f5ead8] shadow-md"
        >
          {toast}
        </p>
      ) : null}
    </div>
  )
}

export default function Settings() {
  return (
    <SettingsCrashGuard>
      <SettingsPage />
    </SettingsCrashGuard>
  )
}
