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

    supabase.auth.getSession().then(async ({ data }) => {
      const nextSession = data.session ?? null
      const nextUser = nextSession?.user ?? null
      const nextProfile = await loadProfile(nextUser)
      if (!active) return
      setSession(nextSession)
      setUser(nextUser)
      setProfile(nextProfile)
      setProfileReady(true)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextUser = next?.user ?? null
      setSession(next)
      setUser(nextUser)
      setProfileReady(false)
      loadProfile(nextUser).then((row) => {
        if (!active) return
        setProfile(row)
        setProfileReady(true)
      })
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
