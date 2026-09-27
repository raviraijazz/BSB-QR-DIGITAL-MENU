import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Field, { inputClass } from '../../components/Field'
import { validateWaiterSelfPasswordChange } from '../../lib/auth'
import { changeOwnWaiterPassword } from '../../services/waiterAuth'

export default function WaiterAccount() {
  const { waiter, restaurant } = useOutletContext()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const validation = validateWaiterSelfPasswordChange({ currentPassword, newPassword, confirmPassword })
    if (validation) {
      setError(validation)
      setNotice('')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    const { error: nextError } = await changeOwnWaiterPassword({
      waiterId: waiter.waiter_id,
      currentPassword,
      newPassword,
    })
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setNotice('Password changed successfully.')
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link to="/waiter" className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
          My Tables
        </Link>
        <h1 className="mt-1 font-display text-3xl">Account</h1>
        <p className="mt-1 text-sm text-muted">Waiter login and password. Restaurant is assigned automatically.</p>
      </div>

      <section className="rounded-2xl border border-line bg-card p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Profile</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Name</dt>
            <dd className="font-medium">{waiter.full_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Waiter ID</dt>
            <dd className="font-mono">{waiter.waiter_id}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Restaurant</dt>
            <dd className="text-right font-medium">{restaurant?.name || '—'}</dd>
          </div>
        </dl>
      </section>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-card p-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Security</p>
          <h2 className="mt-1 font-display text-xl">Change Password</h2>
        </div>
        <Alert>{error}</Alert>
        <Alert type="success">{notice}</Alert>
        <Field label="Current Password">
          <input
            className={inputClass}
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="New Password">
          <input
            className={inputClass}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm New Password">
          <input
            className={inputClass}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Updating...' : 'Update Password'}
        </Button>
      </form>
    </div>
  )
}
