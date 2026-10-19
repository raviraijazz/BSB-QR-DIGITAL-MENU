import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { roleFromUser } from '../services/profiles'

const AuthContext = createContext(null)

async function loadProfile(user) {
  if (!user?.id) return null
  const { data } = await supabase.from('profiles').select('id, username, role').eq('id', user.id).maybeSingle()
  return data || null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [user, setUser] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    let active = true
    let generation = 0

    // Always resolves the loading state, even when session restoration fails,
    // so the UI never hangs on a blank/loading screen.
    async function applySession(nextSession) {
      const gen = ++generation
      const nextUser = nextSession?.user ?? null
      if (active && gen === generation) {
        setSession(nextSession ?? null)
        setUser(nextUser)
        setProfileReady(false)
      }
      let nextProfile = null
      try {
        nextProfile = await loadProfile(nextUser)
      } catch {
        nextProfile = null
      }
      if (!active || gen !== generation) return
      setProfile(nextProfile)
      setProfileReady(true)
    }

    function failSession() {
      if (!active) return
      setSession(null)
      setUser(null)
      setProfile(null)
      setProfileReady(true)
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          failSession()
          return
        }
        applySession(data.session ?? null)
      })
      .catch(failSession)

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next ?? null)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const role = roleFromUser(user, profile)
  const loading = session === undefined || (Boolean(user) && !profileReady)

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      role,
      loading,
      isOwner: Boolean(user) && !loading && role === 'owner',
      isWaiter: Boolean(user) && !loading && role === 'waiter',
      signOut: () => supabase.auth.signOut(),
    }),
    [session, user, profile, role, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
