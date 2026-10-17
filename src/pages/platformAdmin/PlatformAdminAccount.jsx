import { useState } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Field from '../../components/Field'
import PasswordInput from '../../components/PasswordInput'
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin'
import { validateFounderPasswordChange } from '../../lib/auth'
import { changePlatformAdminPassword } from '../../services/platformAdmin'

export default function PlatformAdminAccount() {
  const { admin, verify } = usePlatformAdmin()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const validation = validateFounderPasswordChange({ currentPassword, newPassword, confirmPassword })
    if (validation) {
      setSuccess('')
      setError(validation)
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    const { error: nextError } = await changePlatformAdminPassword({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setSuccess('Your password has been updated.')
    await verify()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Account &amp; Security</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{admin?.username || 'platform admin'}</span>.
        </p>
      </div>

      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Change password</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <Alert>{error}</Alert>
          <Alert type="success">{success}</Alert>
          <Field label="Current password">
            <PasswordInput value={currentPassword} onChange={setCurrentPassword} />
          </Field>
          <Field label="New password" hint="At least 10 characters, using three of: lowercase, uppercase, numbers, symbols.">
            <PasswordInput value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          </Field>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={busy}>
            {busy ? 'Updating...' : 'Update password'}
          </Button>
        </form>
        <p className="mt-4 text-xs text-slate-400">
          Forgot your password? Ask the operator to re-run the protected founder setup, or reset it from the Supabase
          dashboard. No email or OTP recovery is used.
        </p>
      </div>
    </div>
  )
}
