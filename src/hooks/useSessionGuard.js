import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { endAppSession, heartbeatAppSession, startAppSession, touchAppSession } from '../services/appSession'
import {
  ACTIVITY_TOUCH_THROTTLE_MS,
  DEFAULT_POLICIES,
  HEARTBEAT_MS,
  MEANINGFUL_ACTIVITY_EVENTS,
  SESSION_CHANNEL,
  SESSION_EXPIRED_NOTICE,
  SESSION_REVOKED_NOTICE,
  SESSION_SIGNED_OUT_NOTICE,
  continueCannotBypassAbsolute,
  derivedSessionStatus,
  loginPathForRole,
  sessionExpiries,
  stashSessionNotice,
} from '../lib/sessionPolicy'

function resolveAppRole(pathname, role, isAdmin) {
  if (String(pathname || '').startsWith('/platform-admin') || isAdmin) return 'founder'
  if (role === 'waiter') return 'waiter'
  return 'owner'
}

function isSessionPath(pathname) {
  const path = String(pathname || '')
  if (path.startsWith('/platform-admin/login')) return false
  if (path.startsWith('/waiter/login')) return false
  if (path === '/login' || path === '/signup') return false
  if (path.startsWith('/platform-admin')) return true
  if (path.startsWith('/dashboard')) return true
  if (path.startsWith('/waiter')) return true
  return false
}

function expiryNotice(reason) {
  if (reason === 'revoked') return SESSION_REVOKED_NOTICE
  if (reason === 'sign_out') return SESSION_SIGNED_OUT_NOTICE
  return SESSION_EXPIRED_NOTICE
}

function endReason(reason) {
  if (reason === 'revoked') return 'revoked'
  if (reason === 'absolute') return 'absolute_timeout'
  if (reason === 'sign_out') return 'sign_out'
  return 'idle_timeout'
}

export function useSessionGuard({ isAdmin = false } = {}) {
  const { user, role, signOut, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const appRole = resolveAppRole(location.pathname, role, isAdmin)
  const [warningOpen, setWarningOpen] = useState(false)
  const [remainingMs, setRemainingMs] = useState(0)
  const [sharedDevice, setSharedDevice] = useState(false)
  const [ready, setReady] = useState(false)
  const sessionRef = useRef(null)
  const policyRef = useRef(DEFAULT_POLICIES[appRole])
  const lastTouchRef = useRef(0)
  const endingRef = useRef(false)

  const expire = useCallback(
    async (reason = 'idle') => {
      if (endingRef.current) return
      endingRef.current = true
      setWarningOpen(false)
      try {
        await endAppSession(endReason(reason))
      } catch {
        /* still sign out */
      }
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel(SESSION_CHANNEL)
          channel.postMessage({ type: 'expired', reason, role: appRole })
          channel.close()
        }
      } catch {
        /* ignore */
      }
      const notice = expiryNotice(reason)
      stashSessionNotice(notice)
      await signOut()
      navigate(loginPathForRole(appRole, location.pathname), {
        replace: true,
        state: { notice },
      })
    },
    [appRole, location.pathname, navigate, signOut],
  )

  const applySnapshot = useCallback(
    (payload) => {
      if (!payload) return
      if (payload.ok === false) {
        expire(payload.reason || 'idle')
        return
      }
      if (payload.session) sessionRef.current = payload.session
      if (payload.policy) {
        policyRef.current = payload.policy
        setSharedDevice(Boolean(payload.policy.shared_device_lock))
      }
      const now = new Date()
      const status = derivedSessionStatus(sessionRef.current, policyRef.current, now)
      const times = sessionExpiries(sessionRef.current, policyRef.current, now)
      setRemainingMs(Math.max(0, times.remainingMs || 0))
      if (status === 'warning') setWarningOpen(true)
      else if (status === 'active') setWarningOpen(false)
      else if (status === 'expired' || status === 'locked' || status === 'revoked') expire(status === 'revoked' ? 'revoked' : status === 'locked' ? 'idle' : 'absolute')
    },
    [expire],
  )

  const boot = useCallback(async () => {
    if (!user || !isSessionPath(location.pathname) || endingRef.current) {
      sessionRef.current = null
      setReady(true)
      return
    }
    const { data, missing } = await startAppSession(typeof navigator === 'undefined' ? '' : navigator.userAgent || '')
    if (missing) {
      setReady(true)
      return
    }
    applySnapshot(data)
    setReady(true)
  }, [applySnapshot, location.pathname, user])

  useEffect(() => {
    if (!user) endingRef.current = false
    setReady(false)
    boot()
  }, [boot, user?.id, appRole])

  const recordActivity = useCallback(async () => {
    if (!user || endingRef.current || !isSessionPath(location.pathname)) return
    const policy = policyRef.current
    const now = new Date()
    if (continueCannotBypassAbsolute(sessionRef.current, policy, now)) {
      await expire('absolute')
      return
    }
    if (now.getTime() - lastTouchRef.current < ACTIVITY_TOUCH_THROTTLE_MS) return
    lastTouchRef.current = now.getTime()
    const { data, missing } = await touchAppSession()
    if (missing) return
    applySnapshot(data)
  }, [applySnapshot, expire, location.pathname, user])

  useEffect(() => {
    if (!user) return undefined
    const onActivity = (event) => {
      if (!MEANINGFUL_ACTIVITY_EVENTS.includes(event.type)) return
      recordActivity()
    }
    MEANINGFUL_ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }))
    return () => {
      MEANINGFUL_ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity))
    }
  }, [recordActivity, user])

  useEffect(() => {
    if (!user || !isSessionPath(location.pathname)) return undefined
    const onFocus = async () => {
      const { data, missing } = await heartbeatAppSession()
      if (missing) return
      applySnapshot(data)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [applySnapshot, location.pathname, user])

  useEffect(() => {
    if (!user || !isSessionPath(location.pathname)) return undefined
    const timer = window.setInterval(async () => {
      const { data, missing } = await heartbeatAppSession()
      if (missing) return
      applySnapshot(data)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [applySnapshot, location.pathname, user])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined
    const channel = new BroadcastChannel(SESSION_CHANNEL)
    channel.onmessage = (event) => {
      if (event.data?.type === 'expired' || event.data?.type === 'signed-out') {
        expire(event.data?.reason || 'idle')
      }
    }
    return () => channel.close()
  }, [expire])

  const continueSession = useCallback(async () => {
    const now = new Date()
    if (continueCannotBypassAbsolute(sessionRef.current, policyRef.current, now)) {
      await expire('absolute')
      return
    }
    lastTouchRef.current = 0
    await recordActivity()
  }, [expire, recordActivity])

  const manualSignOut = useCallback(async () => {
    endingRef.current = true
    try {
      await endAppSession('sign_out')
    } catch {
      /* still sign out */
    }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(SESSION_CHANNEL)
        channel.postMessage({ type: 'signed-out', role: appRole })
        channel.close()
      }
    } catch {
      /* ignore */
    }
    await signOut()
  }, [appRole, signOut])

  return {
    warningOpen,
    remainingMs,
    sharedDevice,
    ready: ready || loading,
    continueSession,
    expire,
    manualSignOut,
    appRole,
  }
}
