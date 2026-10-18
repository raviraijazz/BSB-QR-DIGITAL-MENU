import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Field from '../../components/Field'
import PasswordInput from '../../components/PasswordInput'
import { useAuth } from '../../hooks/useAuth'
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin'
import { FOUNDER_HOME_PATH, validateNewFounderPassword } from '../../../supabase/functions/_shared/founder-gate.js'
import { changePlatformAdminPassword } from '../../services/platformAdmin'

export default function PlatformAdminChangePassword() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { admin, verify } = usePlatformAdmin()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const validation = validateNewFounderPassword(newPassword, confirmPassword)
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    setError('')
    const { error: nextError } = await changePlatformAdminPassword({ newPassword, confirmPassword })
    if (nextError) {
      setBusy(false)
      setError(nextError.message)
      return
    }
    // Refresh the server-verified gate state before entering the console.
    await verify()
    setBusy(false)
    navigate(FOUNDER_HOME_PATH, { replace: true })
  }

  async function handleSignOut() {
    await signOut()
    navigate('/platform-admin/login', { replace: true })
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-900 px-4 py-16">
      <div className="w-full max-w-md">
        <p className="font-display text-2xl text-white">BSB</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-slate-400">Founder Console</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div>
            <h1 className="font-display text-2xl text-slate-900">Set a new password</h1>
            <p className="mt-1 text-sm text-slate-500">
              {admin?.username ? `${admin.username}, ` : ''}your account still uses the temporary bootstrap password.
              Choose a new password to continue.
            </p>
          </div>
          <Alert>{error}</Alert>
          <Field label="New password" hint="At least 10 characters, using three of: lowercase, uppercase, numbers, symbols.">
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
          </Field>
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={busy}>
            {busy ? 'Updating...' : 'Update password and continue'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          <button type="button" onClick={handleSignOut} className="underline hover:text-slate-200">
            Sign out
          </button>
        </p>
      </div>
    </div>
  )
}
