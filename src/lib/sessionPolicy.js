export const SESSION_ROLES = ['founder', 'owner', 'waiter']

export const SESSION_ROLE_LABELS = {
  founder: 'Founder Admin',
  owner: 'Restaurant Owner',
  waiter: 'Waiter / POS',
}

export const IDLE_MINUTE_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120]
export const LIFETIME_HOUR_OPTIONS = [1, 2, 4, 8, 12, 24]
export const WARNING_SECOND_OPTIONS = [60, 120, 180, 300]

export const DEFAULT_POLICIES = {
  founder: {
    role: 'founder',
    idle_minutes: 15,
    max_lifetime_hours: 8,
    warning_seconds: 120,
    warning_enabled: true,
    auto_logout_enabled: true,
    shared_device_lock: false,
    preserve_unsaved: true,
  },
  owner: {
    role: 'owner',
    idle_minutes: 30,
    max_lifetime_hours: 12,
    warning_seconds: 120,
    warning_enabled: true,
    auto_logout_enabled: true,
    shared_device_lock: false,
    preserve_unsaved: true,
  },
  waiter: {
    role: 'waiter',
    idle_minutes: 15,
    max_lifetime_hours: 8,
    warning_seconds: 120,
    warning_enabled: true,
    auto_logout_enabled: true,
    shared_device_lock: true,
    preserve_unsaved: true,
  },
}

export const SESSION_EXPIRED_NOTICE = 'Your session expired. Please sign in again.'
export const SESSION_SIGNED_OUT_NOTICE = 'You have been signed out.'
export const SESSION_REVOKED_NOTICE = 'This session was ended by a founder. Please sign in again.'
export const SESSION_CHANNEL = 'bsb-app-session'
export const SESSION_NOTICE_KEY = 'bsb-session-notice'
export const ACTIVITY_TOUCH_THROTTLE_MS = 60_000
export const HEARTBEAT_MS = 15_000

export function stashSessionNotice(notice) {
  if (typeof sessionStorage === 'undefined' || !notice) return
  sessionStorage.setItem(SESSION_NOTICE_KEY, notice)
}

export function takeSessionNotice() {
  if (typeof sessionStorage === 'undefined') return ''
  const value = sessionStorage.getItem(SESSION_NOTICE_KEY) || ''
  if (value) sessionStorage.removeItem(SESSION_NOTICE_KEY)
  return value
}

export const MEANINGFUL_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'click']

export function loginPathForRole(role, pathname = '') {
  const path = String(pathname || '')
  if (role === 'founder' || path.startsWith('/platform-admin')) return '/platform-admin/login'
  if (role === 'waiter' || path.startsWith('/waiter')) return '/waiter/login'
  return '/login'
}

export function clonePolicies(policies) {
  const source = policies || DEFAULT_POLICIES
  return SESSION_ROLES.reduce((acc, role) => {
    acc[role] = { ...DEFAULT_POLICIES[role], ...(source[role] || {}) }
    return acc
  }, {})
}

function numberOr(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function normalizePolicy(role, input) {
  const fallback = DEFAULT_POLICIES[role] || DEFAULT_POLICIES.owner
  const row = input || {}
  return {
    role,
    idle_minutes: numberOr(row.idle_minutes, fallback.idle_minutes),
    max_lifetime_hours: numberOr(row.max_lifetime_hours, fallback.max_lifetime_hours),
    warning_seconds: numberOr(row.warning_seconds, fallback.warning_seconds),
    warning_enabled: row.warning_enabled == null ? fallback.warning_enabled : Boolean(row.warning_enabled),
    auto_logout_enabled: row.auto_logout_enabled == null ? fallback.auto_logout_enabled : Boolean(row.auto_logout_enabled),
    shared_device_lock: row.shared_device_lock == null ? fallback.shared_device_lock : Boolean(row.shared_device_lock),
    preserve_unsaved: row.preserve_unsaved == null ? fallback.preserve_unsaved : Boolean(row.preserve_unsaved),
  }
}

export function validateRolePolicy(role, input) {
  if (!SESSION_ROLES.includes(role)) return 'Unknown role'
  const idle = Number(input?.idle_minutes)
  if (!Number.isInteger(idle) || idle < 1 || idle > 1440) return 'Idle timeout must be between 1 and 1440 minutes'
  const lifetime = Number(input?.max_lifetime_hours)
  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > 168) return 'Maximum lifetime must be between 1 and 168 hours'
  const warning = Number(input?.warning_seconds)
  if (!Number.isInteger(warning) || warning < 30 || warning > 3600) {
    return 'Warning interval must be between 30 seconds and 1 hour'
  }
  if (warning >= idle * 60) return 'Warning must be shorter than the idle timeout'
  return ''
}

export function validatePolicies(policies) {
  for (const role of SESSION_ROLES) {
    const error = validateRolePolicy(role, policies?.[role])
    if (error) return `${SESSION_ROLE_LABELS[role]}: ${error}`
  }
  return ''
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes) * 60_000)
}

export function addHours(date, hours) {
  return new Date(date.getTime() + Number(hours) * 3_600_000)
}

export function addSeconds(date, seconds) {
  return new Date(date.getTime() + Number(seconds) * 1000)
}

export function sessionExpiries(session, policy, now = new Date()) {
  const started = new Date(session?.started_at || now)
  const lastActivity = new Date(session?.last_activity_at || session?.started_at || now)
  const idleMinutes = Number(policy?.idle_minutes) || 0
  const lifetimeHours = Number(policy?.max_lifetime_hours) || 0
  const warningSeconds = Number(policy?.warning_seconds) || 0
  const autoLogout = policy?.auto_logout_enabled !== false
  const idleExpiresAt = autoLogout ? addMinutes(lastActivity, idleMinutes) : null
  const absoluteExpiresAt = autoLogout ? addHours(started, lifetimeHours) : null
  const candidates = [idleExpiresAt, absoluteExpiresAt].filter(Boolean)
  const expiresAt = candidates.length ? new Date(Math.min(...candidates.map((d) => d.getTime()))) : null
  const warningAt =
    autoLogout && policy?.warning_enabled && idleExpiresAt
      ? addSeconds(idleExpiresAt, -warningSeconds)
      : null
  return {
    startedAt: started,
    lastActivityAt: lastActivity,
    idleExpiresAt,
    absoluteExpiresAt,
    warningAt,
    expiresAt,
    remainingMs: expiresAt ? expiresAt.getTime() - now.getTime() : null,
    idleRemainingMs: idleExpiresAt ? idleExpiresAt.getTime() - now.getTime() : null,
    absoluteRemainingMs: absoluteExpiresAt ? absoluteExpiresAt.getTime() - now.getTime() : null,
  }
}

export function derivedSessionStatus(session, policy, now = new Date()) {
  if (session?.revoked_at) return 'revoked'
  if (session?.ended_at) return 'expired'
  if (policy?.auto_logout_enabled === false) return 'active'
  const times = sessionExpiries(session, policy, now)
  if (times.expiresAt && now >= times.expiresAt) {
    if (policy?.shared_device_lock && times.idleExpiresAt && now >= times.idleExpiresAt) return 'locked'
    return 'expired'
  }
  if (times.warningAt && now >= times.warningAt && now < times.expiresAt) return 'warning'
  return 'active'
}

export function activityResetsIdleNotAbsolute({ lastActivityAt, startedAt, policy, activityAt }) {
  const next = {
    started_at: startedAt,
    last_activity_at: activityAt,
  }
  const before = sessionExpiries({ started_at: startedAt, last_activity_at: lastActivityAt }, policy, activityAt)
  const after = sessionExpiries(next, policy, activityAt)
  return {
    idleExtended: after.idleExpiresAt && before.idleExpiresAt && after.idleExpiresAt > before.idleExpiresAt,
    absoluteUnchanged:
      after.absoluteExpiresAt && before.absoluteExpiresAt && after.absoluteExpiresAt.getTime() === before.absoluteExpiresAt.getTime(),
  }
}

export function continueCannotBypassAbsolute(session, policy, now = new Date()) {
  const times = sessionExpiries(session, policy, now)
  if (!times.absoluteExpiresAt) return false
  return now >= times.absoluteExpiresAt
}

export function isMeaningfulActivityEvent(type) {
  return MEANINGFUL_ACTIVITY_EVENTS.includes(String(type || ''))
}

export function formatDurationMinutes(minutes) {
  const n = Number(minutes)
  if (!Number.isFinite(n)) return '—'
  if (n < 60) return `${n} min`
  const hours = Math.floor(n / 60)
  const rest = n % 60
  if (!rest) return `${hours} hr${hours === 1 ? '' : 's'}`
  return `${hours} hr ${rest} min`
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function sessionStatusLabel(status) {
  const labels = {
    active: 'Active',
    warning: 'Warning',
    locked: 'Locked',
    expired: 'Expired',
    revoked: 'Revoked',
  }
  return labels[status] || '—'
}

export function policiesFromRows(rows) {
  const next = clonePolicies()
  for (const row of rows || []) {
    if (!SESSION_ROLES.includes(row.role)) continue
    next[row.role] = {
      role: row.role,
      idle_minutes: Number(row.idle_minutes),
      max_lifetime_hours: Number(row.max_lifetime_hours),
      warning_seconds: Number(row.warning_seconds),
      warning_enabled: Boolean(row.warning_enabled),
      auto_logout_enabled: Boolean(row.auto_logout_enabled),
      shared_device_lock: Boolean(row.shared_device_lock),
      preserve_unsaved: Boolean(row.preserve_unsaved),
    }
  }
  return next
}
