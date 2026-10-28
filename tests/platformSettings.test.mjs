import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PUBLIC_SETTINGS,
  adminSettingsFromPayload,
  buildSettingsPayload,
  highImpactWarnings,
  maintenanceDisplayMessage,
  publicSettingsFromPayload,
  registrationClosedMessage,
  signupAllowed,
  staffAccessBlocked,
  validateSettings,
  whatsappHref,
} from '../src/lib/platformSettings.js'

test('defaults keep BSB identity and open registration', () => {
  const row = publicSettingsFromPayload(null)
  assert.equal(row.display_name, 'BSB Digital Menu')
  assert.equal(row.registration_enabled, true)
  assert.equal(row.maintenance_enabled, false)
  assert.equal(signupAllowed(row), true)
})

test('validateSettings rejects blank name and invalid contact', () => {
  assert.equal(validateSettings({ ...DEFAULT_PUBLIC_SETTINGS, display_name: 'A' }), 'Platform name must be between 2 and 80 characters')
  assert.equal(validateSettings({ ...DEFAULT_PUBLIC_SETTINGS, support_email: 'not-an-email' }), 'Enter a valid support email')
  assert.equal(validateSettings({ ...DEFAULT_PUBLIC_SETTINGS, support_whatsapp: '123' }), 'WhatsApp number must be 10 to 15 digits')
  assert.equal(validateSettings(DEFAULT_PUBLIC_SETTINGS), '')
})

test('buildSettingsPayload strips WhatsApp formatting', () => {
  const payload = buildSettingsPayload({
    ...DEFAULT_PUBLIC_SETTINGS,
    support_whatsapp: '+91 97214 50099',
    support_email: '  Help@Example.com ',
  })
  assert.equal(payload.support_whatsapp, '919721450099')
  assert.equal(payload.support_email, 'help@example.com')
})

test('closing registration and enabling maintenance are high-impact', () => {
  const warnings = highImpactWarnings(
    { registration_enabled: true, maintenance_enabled: false },
    { registration_enabled: false, maintenance_enabled: true },
  )
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /New restaurant owner/)
  assert.match(warnings[1], /Owner dashboards/)
})

test('reopening registration or turning maintenance off is not high-impact', () => {
  assert.deepEqual(
    highImpactWarnings(
      { registration_enabled: false, maintenance_enabled: true },
      { registration_enabled: true, maintenance_enabled: false },
    ),
    [],
  )
})

test('signupAllowed and staffAccessBlocked follow server flags', () => {
  assert.equal(signupAllowed({ registration_enabled: false }), false)
  assert.equal(staffAccessBlocked({ maintenance_enabled: true }, { isAdmin: false }), true)
  assert.equal(staffAccessBlocked({ maintenance_enabled: true }, { isAdmin: true }), false)
  assert.equal(staffAccessBlocked({ maintenance_enabled: false }, { isAdmin: false }), false)
})

test('custom messages win over defaults', () => {
  assert.equal(registrationClosedMessage({ registration_message: 'Closed this week.' }), 'Closed this week.')
  assert.match(registrationClosedMessage({ registration_message: '' }), /currently closed/)
  assert.equal(maintenanceDisplayMessage({ maintenance_message: 'Back at 4pm.' }), 'Back at 4pm.')
  assert.match(maintenanceDisplayMessage({ maintenance_message: '   ' }), /temporarily unavailable/)
})

test('whatsappHref and admin payload keep last-changed metadata', () => {
  assert.equal(whatsappHref('+91 97214 50099'), 'https://wa.me/919721450099')
  const admin = adminSettingsFromPayload({
    display_name: 'BSB',
    updated_at: '2026-10-26T00:00:00.000Z',
    updated_by_username: 'founder',
  })
  assert.equal(admin.updated_by_username, 'founder')
  assert.equal(admin.display_name, 'BSB')
})

test('missing SQL payload falls back instead of inventing extra features', () => {
  const row = publicSettingsFromPayload({})
  assert.equal(row.registration_enabled, true)
  assert.equal(row.maintenance_enabled, false)
  assert.equal('currency' in row, false)
  assert.equal('logo_url' in row, false)
})
