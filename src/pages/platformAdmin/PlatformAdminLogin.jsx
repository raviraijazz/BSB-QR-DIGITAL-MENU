import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Field, { inputClass } from '../../components/Field'
import PasswordInput from '../../components/PasswordInput'
import { useAuth } from '../../hooks/useAuth'
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin'
import { friendlyAuthError, platformAuthEmailFromUsername, validateFounderLogin } from '../../lib/auth'
import { PLATFORM_ADMIN_HOME } from '../../lib/platformAdmin'
import { supabase } from '../../lib/supabase'
import { whoami } from '../../services/platformAdmin'

const NOT_AUTHORIZED = 'You are not authorized to access the Platform Admin Panel.'

export default function PlatformAdminLogin() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isAdmin, checked, checking, verify } = usePlatformAdmin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user && !checked && !checking) verify()
  }, [user, checked, checking, verify])

  if (user && checked && isAdmin) return <Navigate to={PLATFORM_ADMIN_HOME} replace />

  async function onSubmit(event) {
    event.preventDefault()
    const validation = validateFounderLogin({ username, password })
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: platformAuthEmailFromUsername(username),
      password,
    })
    if (signInError) {
      setBusy(false)
      setError(friendlyAuthError(signInError))
      return
    }
    const { data, error: checkError } = await whoami()
    if (checkError || !data?.isAdmin) {
      await supabase.auth.signOut()
      setBusy(false)
      setError(NOT_AUTHORIZED)
      return
    }
    setBusy(false)
    navigate(PLATFORM_ADMIN_HOME, { replace: true })
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-900 px-4 py-16">
      <div className="w-full max-w-md">
        <p className="font-display text-2xl text-white">BSB</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-slate-400">Founder Console</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div>
            <h1 className="font-display text-2xl text-slate-900">Platform admin sign in</h1>
            <p className="mt-1 text-sm text-slate-500">Authorized founder access only.</p>
          </div>
          <Alert>{error}</Alert>
          <Field label="Username">
            <input
              className={inputClass}
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <PasswordInput value={password} onChange={setPassword} />
          </Field>
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Return to <Link to="/login" className="text-slate-200 underline">restaurant login</Link>
        </p>
      </div>
    </div>
  )
}
