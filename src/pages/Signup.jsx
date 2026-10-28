import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Field, { inputClass } from '../components/Field'
import {
  authEmailFromUsername,
  friendlyAuthError,
  normalizePhone,
  normalizeUsername,
  validateSignup,
} from '../lib/auth'
import { supabase } from '../lib/supabase'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { registrationClosedMessage, signupAllowed } from '../lib/platformSettings'
import { createProfile, isUsernameAvailable } from '../services/profiles'

export default function Signup() {
  const navigate = useNavigate()
  const { settings } = usePlatformSettings()
  const canSignup = signupAllowed(settings)
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const validation = validateSignup({ username, phone, password, confirmPassword })
    if (validation) {
      setError(validation)
      return
    }

    if (!canSignup) {
      setError(registrationClosedMessage(settings))
      return
    }

    setBusy(true)
    setError('')

    const handle = normalizeUsername(username)
    const contact = normalizePhone(phone)
    const { available, error: usernameError } = await isUsernameAvailable(handle)
    if (!usernameError && available === false) {
      setBusy(false)
      setError('Username already exists')
      return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: authEmailFromUsername(handle),
      password,
      options: {
        data: {
          username: handle,
          contact_number: contact,
        },
      },
    })

    if (signUpError) {
      setBusy(false)
      setError(friendlyAuthError(signUpError))
      return
    }

    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmailFromUsername(handle),
        password,
      })
      if (signInError) {
        setBusy(false)
        setError(friendlyAuthError(signInError))
        return
      }
    }

    if (data.user?.id) {
      const { error: profileError } = await createProfile(data.user.id, handle, 'owner')
      if (profileError) {
        await supabase.auth.signOut()
        setBusy(false)
        const msg = String(profileError.message || '')
        setError(
          /row-level security|violates|permission denied/i.test(msg)
            ? registrationClosedMessage(settings)
            : friendlyAuthError(profileError),
        )
        return
      }
    }

    setBusy(false)
    navigate('/dashboard', { replace: true })
  }

  if (!canSignup) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-display text-3xl">Registrations closed</h1>
        <p className="mt-2 text-sm text-muted">{registrationClosedMessage(settings)}</p>
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account? <Link to="/login" className="text-ink underline">Log in</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl">Create your account</h1>
      <p className="mt-2 text-sm text-muted">Free to start. One restaurant per account.</p>
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
        <Field label="Contact number">
          <input
            className={inputClass}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating...' : 'Sign up'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account? <Link to="/login" className="text-ink underline">Log in</Link>
      </p>
    </div>
  )
}
