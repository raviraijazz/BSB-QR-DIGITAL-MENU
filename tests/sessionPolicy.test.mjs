import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_POLICIES,
  activityResetsIdleNotAbsolute,
  continueCannotBypassAbsolute,
  derivedSessionStatus,
  formatCountdown,
  isMeaningfulActivityEvent,
  loginPathForRole,
  policiesFromRows,
  sessionExpiries,
  validatePolicies,
  validateRolePolicy,
} from '../src/lib/sessionPolicy.js'

test('default policies match founder/owner/waiter timeouts', () => {
  assert.equal(DEFAULT_POLICIES.founder.idle_minutes, 15)
  assert.equal(DEFAULT_POLICIES.founder.max_lifetime_hours, 8)
  assert.equal(DEFAULT_POLICIES.founder.warning_seconds, 120)
  assert.equal(DEFAULT_POLICIES.owner.idle_minutes, 30)
  assert.equal(DEFAULT_POLICIES.owner.max_lifetime_hours, 12)
  assert.equal(DEFAULT_POLICIES.waiter.idle_minutes, 15)
  assert.equal(DEFAULT_POLICIES.waiter.shared_device_lock, true)
  assert.equal(validatePolicies(DEFAULT_POLICIES), '')
})

test('validateRolePolicy rejects warning that is not shorter than idle', () => {
  assert.match(
    validateRolePolicy('founder', { idle_minutes: 2, max_lifetime_hours: 8, warning_seconds: 120 }),
    /shorter than the idle timeout/,
  )
  assert.equal(
    validateRolePolicy('founder', { idle_minutes: 15, max_lifetime_hours: 8, warning_seconds: 120 }),
    '',
  )
})

test('meaningful activity includes clicks and keys but not polling labels', () => {
  assert.equal(isMeaningfulActivityEvent('pointerdown'), true)
  assert.equal(isMeaningfulActivityEvent('keydown'), true)
  assert.equal(isMeaningfulActivityEvent('touchstart'), true)
  assert.equal(isMeaningfulActivityEvent('click'), true)
  assert.equal(isMeaningfulActivityEvent('visibilitychange'), false)
  assert.equal(isMeaningfulActivityEvent('token-refresh'), false)
  assert.equal(isMeaningfulActivityEvent('heartbeat'), false)
})

test('activity resets idle expiry without extending absolute lifetime', () => {
  const startedAt = new Date('2026-10-24T00:00:00.000Z')
  const lastActivityAt = new Date('2026-10-24T00:10:00.000Z')
  const activityAt = new Date('2026-10-24T00:20:00.000Z')
  const result = activityResetsIdleNotAbsolute({
    lastActivityAt,
    startedAt,
    policy: DEFAULT_POLICIES.founder,
    activityAt,
  })
  assert.equal(result.idleExtended, true)
  assert.equal(result.absoluteUnchanged, true)
})

test('continue cannot bypass absolute lifetime', () => {
  const session = {
    started_at: '2026-10-24T00:00:00.000Z',
    last_activity_at: '2026-10-24T07:50:00.000Z',
  }
  assert.equal(continueCannotBypassAbsolute(session, DEFAULT_POLICIES.founder, new Date('2026-10-24T08:00:00.000Z')), true)
  assert.equal(continueCannotBypassAbsolute(session, DEFAULT_POLICIES.founder, new Date('2026-10-24T07:59:00.000Z')), false)
})

test('derived status covers warning, idle expiry, lock and revoke', () => {
  const policy = DEFAULT_POLICIES.waiter
  const session = {
    started_at: '2026-10-24T00:00:00.000Z',
    last_activity_at: '2026-10-24T00:00:00.000Z',
  }
  assert.equal(derivedSessionStatus(session, policy, new Date('2026-10-24T00:13:30.000Z')), 'warning')
  assert.equal(derivedSessionStatus(session, policy, new Date('2026-10-24T00:15:00.000Z')), 'locked')
  assert.equal(derivedSessionStatus({ ...session, revoked_at: '2026-10-24T00:14:00.000Z' }, policy, new Date('2026-10-24T00:14:01.000Z')), 'revoked')
  const ownerSession = {
    started_at: '2026-10-24T00:00:00.000Z',
    last_activity_at: '2026-10-24T00:00:00.000Z',
  }
  assert.equal(derivedSessionStatus(ownerSession, DEFAULT_POLICIES.owner, new Date('2026-10-24T00:01:00.000Z')), 'active')
})

test('token refresh time does not count as last activity in expiry math', () => {
  const started = new Date('2026-10-24T00:00:00.000Z')
  const lastActivity = new Date('2026-10-24T00:00:00.000Z')
  const now = new Date('2026-10-24T00:16:00.000Z')
  const times = sessionExpiries(
    { started_at: started.toISOString(), last_activity_at: lastActivity.toISOString() },
    DEFAULT_POLICIES.founder,
    now,
  )
  assert.equal(times.idleExpiresAt.toISOString(), '2026-10-24T00:15:00.000Z')
  assert.equal(times.absoluteExpiresAt.toISOString(), '2026-10-24T08:00:00.000Z')
  assert.ok(now >= times.idleExpiresAt)
})

test('login paths stay role-specific and countdown formatting is stable', () => {
  assert.equal(loginPathForRole('founder'), '/platform-admin/login')
  assert.equal(loginPathForRole('owner'), '/login')
  assert.equal(loginPathForRole('waiter'), '/waiter/login')
  assert.equal(formatCountdown(125000), '2:05')
  assert.equal(formatCountdown(0), '0:00')
})

test('policiesFromRows fills missing roles from defaults', () => {
  const next = policiesFromRows([{ role: 'owner', idle_minutes: 45, max_lifetime_hours: 12, warning_seconds: 120 }])
  assert.equal(next.owner.idle_minutes, 45)
  assert.equal(next.founder.idle_minutes, 15)
  assert.equal(next.waiter.shared_device_lock, true)
})
