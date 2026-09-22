import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import { useAuth } from '../../hooks/useAuth'
import { authEmailFromUsername, friendlyAuthError } from '../../lib/auth'
import { menuUrl } from '../../lib/menuUrl'
import { supabase } from '../../lib/supabase'
import { updateSlug } from '../../services/restaurants'

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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setBusy(false)
  }, [open])

  if (!open) return null

  async function onSubmit(event) {
    event.preventDefault()
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
        <h2 id="change-password-title" className="font-display text-xl">Change Password</h2>
        <div className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          <Field label="Current Password">
            <input className={inputClass} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Field label="New Password">
            <input className={inputClass} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <Field label="Confirm New Password">
            <input className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Updating...' : 'Update Password'}</Button>
        </div>
      </form>
    </div>
  )
}

export default function Settings() {
  const { user, restaurant, loading, setRestaurant } = useOutletContext()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [slugInput, setSlugInput] = useState(restaurant?.slug || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  const username = user?.user_metadata?.username || ''
  const contact = user?.user_metadata?.contact_number || ''
  const url = restaurant?.slug ? menuUrl(restaurant.slug) : ''

  useEffect(() => {
    setSlugInput(restaurant?.slug || '')
    setError('')
    setNotice('')
  }, [restaurant?.id])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(timer)
  }, [toast])

  if (loading) return <Spinner />

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
    await signOut()
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-3xl">Settings</h1>

      {restaurant ? (
        <Card title="Public Menu" compact>
          <p className="break-all text-sm text-ink">{url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyUrl}>Copy URL</Button>
            <a href={url} target="_blank" rel="noreferrer">
              <Button variant="secondary">Open Menu</Button>
            </a>
          </div>
          <form onSubmit={onSlug} className="mt-5 space-y-3 border-t border-line pt-4">
            <Alert>{error}</Alert>
            <Alert type="success">{notice}</Alert>
            <Field
              label="Menu Slug"
              hint="Changing the slug changes your public menu URL. Existing printed QR codes and shared links may stop working."
            >
              <input className={inputClass} value={slugInput} onChange={(e) => setSlugInput(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Update Slug'}</Button>
          </form>
        </Card>
      ) : (
        <Card title="Public Menu" compact>
          <p className="text-sm text-muted">Create a restaurant to get a public menu URL.</p>
          <Link to="/dashboard/restaurant" className="mt-3 inline-block">
            <Button>Set up restaurant</Button>
          </Link>
        </Card>
      )}

      <Card title="Restaurant Profile" compact>
        <p className="text-sm text-muted">
          Manage your restaurant name, logo, phone number, address and other public information.
        </p>
        <Link to="/dashboard/restaurant" className="mt-3 inline-block">
          <Button variant="secondary">Manage Restaurant →</Button>
        </Link>
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
