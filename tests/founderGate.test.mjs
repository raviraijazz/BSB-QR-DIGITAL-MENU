import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FOUNDER_HOME_PATH,
  FOUNDER_LOCKED_ACTIONS,
  FOUNDER_MUST_CHANGE_PATH,
  founderGateRedirect,
  isFounderActionAllowed,
  validateNewFounderPassword,
} from '../supabase/functions/_shared/founder-gate.js'

test('locked founder may only call whoami and change_password', () => {
  for (const action of FOUNDER_LOCKED_ACTIONS) {
    assert.equal(isFounderActionAllowed(action, true), true, action)
  }
})

test('locked founder is denied every privileged action', () => {
  const privileged = ['overview', 'restaurants', 'restaurant', 'fetch_sheet', 'start_support', 'import', 'audit']
  for (const action of privileged) {
    assert.equal(isFounderActionAllowed(action, true), false, action)
  }
  assert.equal(isFounderActionAllowed(undefined, true), false)
})

test('after the password change every action is allowed', () => {
  for (const action of ['overview', 'restaurants', 'import_menu', 'change_password', '']) {
    assert.equal(isFounderActionAllowed(action, false), true, action)
  }
})

test('redirects a locked admin to the change-password page from every console route', () => {
  const routes = ['/platform-admin', '/platform-admin/restaurants', '/platform-admin/audit', '/platform-admin/support/x']
  for (const pathname of routes) {
    assert.equal(
      founderGateRedirect({ isAdmin: true, mustChangePassword: true, pathname }),
      FOUNDER_MUST_CHANGE_PATH,
      pathname,
    )
  }
  assert.equal(
    founderGateRedirect({ isAdmin: true, mustChangePassword: true, pathname: FOUNDER_MUST_CHANGE_PATH }),
    null,
  )
})

test('an unlocked admin cannot reopen the forced-change page', () => {
  assert.equal(
    founderGateRedirect({ isAdmin: true, mustChangePassword: false, pathname: FOUNDER_MUST_CHANGE_PATH }),
    FOUNDER_HOME_PATH,
  )
  assert.equal(founderGateRedirect({ isAdmin: true, mustChangePassword: false, pathname: FOUNDER_HOME_PATH }), null)
})

test('non-admins are never redirected by the founder gate', () => {
  assert.equal(founderGateRedirect({ isAdmin: false, mustChangePassword: true, pathname: FOUNDER_HOME_PATH }), null)
})

test('new password must be strong and confirmed', () => {
  assert.match(validateNewFounderPassword('', ''), /required/i)
  assert.match(validateNewFounderPassword('Short1!', 'Short1!'), /at least 10/i)
  assert.match(validateNewFounderPassword('alllowercase1', 'alllowercase1'), /three of/i)
  assert.match(validateNewFounderPassword('StrongPass1!', 'StrongPass2!'), /do not match/i)
  assert.match(validateNewFounderPassword('TempPass1!', 'TempPass1!', 'TempPass1!'), /different/i)
  assert.equal(validateNewFounderPassword('StrongPass1!', 'StrongPass1!'), '')
})

test('the temporary bootstrap password is rejected as the new password', () => {
  const temporary = 'TempPass1!'
  assert.notEqual(validateNewFounderPassword(temporary, temporary, temporary), '')
})
