import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { whoami } from '../services/platformAdmin'
import { useAuth } from './useAuth'

const PlatformAdminContext = createContext(null)

export function PlatformAdminProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [admin, setAdmin] = useState(null)
  const [checked, setChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  // Reset verification whenever the signed-in user changes.
  useEffect(() => {
    setAdmin(null)
    setChecked(false)
    setChecking(false)
    setError('')
  }, [user?.id])

  const verify = useCallback(async () => {
    if (!user) {
      setAdmin(null)
      setChecked(true)
      return null
    }
    setChecking(true)
    setError('')
    const { data, error: nextError } = await whoami()
    setChecking(false)
    setChecked(true)
    if (nextError) {
      setAdmin(null)
      setError(nextError.message)
      return null
    }
    if (data?.isAdmin) {
      setAdmin(data.user || { id: user.id })
      return data.user
    }
    setAdmin(null)
    return null
  }, [user])

  const value = useMemo(
    () => ({
      admin,
      isAdmin: Boolean(admin),
      checked,
      checking,
      error,
      verify,
    }),
    [admin, checked, checking, error, verify],
  )

  return <PlatformAdminContext.Provider value={value}>{children}</PlatformAdminContext.Provider>
}

export function usePlatformAdmin() {
  const ctx = useContext(PlatformAdminContext)
  if (!ctx) throw new Error('usePlatformAdmin must be used within PlatformAdminProvider')
  return ctx
}
