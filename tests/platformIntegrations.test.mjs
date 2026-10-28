import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTEGRATION_PROVIDERS,
  activityForProvider,
  deriveIntegrationStatus,
  filterProviders,
  logsState,
  parseGoogleSheetRef,
  providerById,
  redactSecrets,
  safeErrorMessage,
  sheetCsvCandidates,
  testResultDetails,
  validateSheetTestUrl,
} from '../src/lib/platformIntegrations.js'

test('catalog lists Google Sheets as implemented and other providers as not implemented', () => {
  const sheets = providerById('google_sheets')
  assert.equal(sheets.implemented, true)
  assert.equal(sheets.testable, true)
  assert.equal(sheets.existingRoute, '/platform-admin/import-menu')
  assert.equal(sheets.secretsRequired.length, 0)
  for (const id of ['whatsapp_business', 'payment_gateway', 'email_smtp', 'webhooks']) {
    const row = providerById(id)
    assert.equal(row.implemented, false)
    assert.equal(row.testable, false)
    assert.equal(deriveIntegrationStatus(row), 'not_implemented')
    assert.equal(
      deriveIntegrationStatus(row, { lastSuccess: { created_at: '2026-10-01T00:00:00Z' } }),
      'not_implemented',
    )
  }
})

test('status is derived from activity and is never hardcoded connected', () => {
  const sheets = providerById('google_sheets')
  assert.equal(deriveIntegrationStatus(sheets), 'not_configured')
  assert.equal(deriveIntegrationStatus(sheets, { logsUnavailable: true }), 'not_configured')
  assert.equal(
    deriveIntegrationStatus(sheets, { lastSuccess: { created_at: '2026-10-01T00:00:00Z' } }),
    'connected',
  )
  assert.equal(
    deriveIntegrationStatus(sheets, {
      lastSuccess: { created_at: '2026-10-01T00:00:00Z' },
      lastError: { created_at: '2026-10-02T00:00:00Z' },
    }),
    'error',
  )
  assert.equal(deriveIntegrationStatus(sheets, { enabled: false }), 'disabled')
  assert.equal(deriveIntegrationStatus({ implemented: true, secretsRequired: ['X'] }), 'setup_required')
})

test('history rows for a different provider do not mark Google Sheets connected', () => {
  const sheets = providerById('google_sheets')
  const activity = activityForProvider(sheets, [
    { id: '1', provider: 'whatsapp_business', action: 'integration_test', ok: true, created_at: '2026-10-02T00:00:00Z' },
    { id: '2', action: 'menu_import', provider: 'google_sheets', ok: true, created_at: '2026-10-01T00:00:00Z' },
  ])
  assert.equal(activity.rows.length, 1)
  assert.equal(activity.lastSuccess.id, '2')
  assert.equal(deriveIntegrationStatus(sheets, activity), 'connected')
})

test('validateSheetTestUrl rejects missing and non-Google URLs', () => {
  assert.equal(validateSheetTestUrl(''), 'Paste a Google Sheets URL first.')
  assert.match(validateSheetTestUrl('https://example.com/file.csv'), /Only public Google Sheets/)
  assert.equal(
    validateSheetTestUrl('https://docs.google.com/spreadsheets/d/abc/edit'),
    '',
  )
})

test('parseGoogleSheetRef keeps spreadsheet id and worksheet gid', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1RTpREaNsEvUU-lvJGDfV2U7kJO6bytdjMFI6b9AiMBY/edit?pli=1&gid=0#gid=0'
  const ref = parseGoogleSheetRef(url)
  assert.equal(ref.spreadsheetId, '1RTpREaNsEvUU-lvJGDfV2U7kJO6bytdjMFI6b9AiMBY')
  assert.equal(ref.gid, '0')
  assert.match(ref.exportUrl, /export\?format=csv&gid=0/)
  const candidates = sheetCsvCandidates(url)
  assert.equal(candidates[0], ref.exportUrl)
  assert.match(candidates[1], /tqx=out:csv&gid=0/)
  assert.equal(parseGoogleSheetRef('https://docs.google.com/spreadsheets/d/abc/edit#gid=12').gid, '12')
  assert.equal(parseGoogleSheetRef('https://example.com/not-a-sheet'), null)
})

test('redactSecrets never returns token values in logs or details', () => {
  const redacted = redactSecrets({
    provider: 'google_sheets',
    api_key: 'sk_live_secret',
    nested: { access_token: 'tok_123', message: 'ok' },
  })
  assert.equal(redacted.api_key, '[redacted]')
  assert.equal(redacted.nested.access_token, '[redacted]')
  assert.equal(redacted.nested.message, 'ok')
  assert.equal(safeErrorMessage('Bearer abcdefghijklmnop failed'), 'Bearer [redacted] failed')
  const details = testResultDetails({ ok: false, message: 'Bearer supersecret failed', rowCount: 0 })
  assert.equal(details.ok, false)
  assert.match(details.message, /\[redacted\]/)
  assert.doesNotMatch(JSON.stringify(details), /supersecret/)
})

test('filterProviders searches name, purpose and status', () => {
  const rows = filterProviders(INTEGRATION_PROVIDERS, { search: 'webhook' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'webhooks')
  const menu = filterProviders(INTEGRATION_PROVIDERS, { category: 'menu_import' })
  assert.equal(menu.length, 1)
  assert.equal(menu[0].id, 'google_sheets')
})

test('logsState distinguishes unavailable logging from zero failures', () => {
  assert.equal(logsState({ error: 'RPC missing', loaded: true, rows: [] }), 'unavailable')
  assert.equal(logsState({ error: '', loaded: true, rows: [] }), 'empty')
  assert.equal(logsState({ error: '', loaded: false, rows: [] }), 'loading')
  assert.equal(logsState({ error: '', loaded: true, rows: [{ id: '1' }] }), 'ready')
})
