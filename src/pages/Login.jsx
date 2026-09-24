import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Field, { inputClass } from '../components/Field'
import { authEmailFromUsername, friendlyAuthError, validateLogin } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const validation = validateLogin({ username, password })
    if (validation) {
      setError(validation)
      return
    }

    setBusy(true)
    setError('')
    const { error: nextError } = await supabase.auth.signInWithPassword({
      email: authEmailFromUsername(username),
      password,
    })
    if (nextError) {
      setBusy(false)
      setError(friendlyAuthError(nextError))
      return
    }
    const { data: userData } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user?.id || '')
      .maybeSingle()
    setBusy(false)
    if (profile?.role === 'waiter' || userData.user?.user_metadata?.role === 'waiter') {
      await supabase.auth.signOut()
      setError('Use waiter login with your waiter ID.')
      return
    }
    const from = location.state?.from
    navigate(from && String(from).startsWith('/dashboard') ? from : '/dashboard', { replace: true })
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">Log in to manage your digital menu.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-line bg-card p-6">
        <Alert>{error}</Alert>
        <Field label="Username">
          <input
            className={inputClass}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in...' : 'Log in'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        New here? <Link to="/signup" className="text-ink underline">Create an account</Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted">
        Waiter? <Link to="/waiter/login" className="text-ink underline">Waiter login</Link>
      </p>
    </div>
  )
}
