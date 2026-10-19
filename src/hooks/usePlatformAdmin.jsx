import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { SESSION_REQUIRED, whoami } from '../services/platformAdmin'
import { useAuth } from './useAuth'

const PlatformAdminContext = createContext(null)

export function PlatformAdminProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [admin, setAdmin] = useState(null)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [checked, setChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [error, setError] = useState('')

  // Reset verification whenever the signed-in user changes.
  useEffect(() => {
    setAdmin(null)
    setMustChangePassword(false)
    setChecked(false)
    setChecking(false)
    setNeedsSignIn(false)
    setError('')
  }, [user?.id])

  const verify = useCallback(async () => {
    if (!user) {
      setAdmin(null)
      setMustChangePassword(false)
      setNeedsSignIn(false)
      setChecked(true)
      return null
    }
    setChecking(true)
    setError('')
    setNeedsSignIn(false)
    const { data, error: nextError } = await whoami()
    setChecking(false)
    setChecked(true)
    if (nextError) {
      setAdmin(null)
      setMustChangePassword(false)
      // An ended session is not a backend/configuration failure: the user must
      // sign in again, so the guard redirects instead of showing an error card.
      setNeedsSignIn(nextError.code === SESSION_REQUIRED)
      setError(nextError.message)
      return null
    }
    if (data?.isAdmin) {
      setAdmin(data.user || { id: user.id })
      setMustChangePassword(Boolean(data.mustChangePassword))
      return data.user
    }
    setAdmin(null)
    setMustChangePassword(false)
    return null
  }, [user])

  const value = useMemo(
    () => ({
      admin,
      isAdmin: Boolean(admin),
      mustChangePassword,
      needsSignIn,
      checked,
      checking,
      error,
      verify,
    }),
    [admin, mustChangePassword, needsSignIn, checked, checking, error, verify],
  )

  return <PlatformAdminContext.Provider value={value}>{children}</PlatformAdminContext.Provider>
}

export function usePlatformAdmin() {
  const ctx = useContext(PlatformAdminContext)
  if (!ctx) throw new Error('usePlatformAdmin must be used within PlatformAdminProvider')
  return ctx
}
