import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Field, { inputClass } from '../components/Field'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: nextError } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    navigate(location.state?.from || '/dashboard', { replace: true })
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">Log in to manage your digital menu.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-line bg-card p-6">
        <Alert>{error}</Alert>
        <Field label="Email">
          <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            required
            minLength={6}
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
    </div>
  )
}
