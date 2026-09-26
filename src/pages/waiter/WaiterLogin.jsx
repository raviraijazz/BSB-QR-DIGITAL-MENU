import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Field, { inputClass } from '../../components/Field'
import { friendlyAuthError, validateWaiterLogin } from '../../lib/auth'
import { signInWaiter } from '../../services/waiterAuth'

export default function WaiterLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [waiterId, setWaiterId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const validation = validateWaiterLogin({ waiterId, password })
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    setError('')
    const { error: nextError } = await signInWaiter(waiterId, password)
    setBusy(false)
    if (nextError) {
      const msg = String(nextError.message || '')
      const known =
        msg.includes('disabled') ||
        msg.includes('Invalid waiter ID') ||
        msg.includes('Waiter account not found') ||
        msg.includes('not a waiter') ||
        msg.includes('owner login') ||
        msg.includes('not confirmed') ||
        msg.includes('restaurant is not assigned')
      setError(known ? msg : friendlyAuthError(nextError))
      return
    }
    const from = location.state?.from
    navigate(from && String(from).startsWith('/waiter') ? from : '/waiter', {
      replace: true,
    })
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">BSB Digital Menu</p>
      <h1 className="mt-1 font-display text-3xl">Waiter Login</h1>
      <p className="mt-2 text-sm text-muted">Use your waiter ID and password. Restaurant is assigned automatically.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-line bg-card p-6">
        <Alert>{error}</Alert>
        <Field label="Waiter ID">
          <input
            className={inputClass}
            autoComplete="username"
            value={waiterId}
            onChange={(e) => setWaiterId(e.target.value)}
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
          {busy ? 'Signing in...' : 'Login'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Restaurant owner? <Link to="/login" className="text-ink underline">Owner login</Link>
      </p>
    </div>
  )
}
