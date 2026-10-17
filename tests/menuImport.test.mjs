import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRows,
  guessMapping,
  parseCsvText,
  summarizeImport,
} from '../src/lib/menuImport.js'
import {
  platformAuthEmailFromUsername,
  validateFounderLogin,
  validateFounderPasswordChange,
} from '../src/lib/auth.js'
import { remainingDaysLabel, STATUS_META } from '../src/lib/platformAdmin.js'

test('parseCsvText handles quotes, commas in fields and CRLF', () => {
  const grid = parseCsvText('name,category,price\r\n"Veg, Burger",Burgers,199\r\n"Say ""hi""",Mains,50\r\n')
  assert.equal(grid.length, 3)
  assert.deepEqual(grid[1], ['Veg, Burger', 'Burgers', '199'])
  assert.deepEqual(grid[2], ['Say "hi"', 'Mains', '50'])
})

test('guessMapping finds common headers and fuzzy matches', () => {
  const mapping = guessMapping(['Item Name', 'Section', 'Rate', 'Description', 'Type', 'Available', 'Image'])
  assert.equal(mapping.name, 0)
  assert.equal(mapping.category, 1)
  assert.equal(mapping.price, 2)
  assert.equal(mapping.description, 3)
  assert.equal(mapping.food_type, 4)
  assert.equal(mapping.is_available, 5)
  assert.equal(mapping.image_url, 6)
})

test('buildRows validates required fields, prices, categories and duplicates', () => {
  const grid = [
    ['Item', 'Category', 'Price', 'Type', 'Available'],
    ['Paneer Tikka', 'Starters', '₹250', 'veg', 'yes'],
    ['', 'Starters', '100', 'veg', 'yes'],
    ['Bad Price', 'Starters', 'abc', 'veg', 'yes'],
    ['No Category Item', '', '100', 'veg', 'yes'],
    ['Paneer Tikka', 'Starters', '250', 'veg', 'yes'],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Paneer Tikka')
  assert.equal(rows[0].price, 250)
  assert.equal(rows[0].food_type, 'veg')
  assert.equal(errors.length, 4)
  const messages = errors.flatMap((e) => e.messages)
  assert.ok(messages.some((m) => m.includes('Missing item name')))
  assert.ok(messages.some((m) => m.includes('Invalid price')))
  assert.ok(messages.some((m) => m.includes('Missing category')))
  assert.ok(messages.some((m) => m.includes('Duplicate')))
})

test('buildRows applies default category and non-veg normalization', () => {
  const grid = [
    ['Item', 'Price', 'Food Type'],
    ['Chicken Wings', '300', 'Non-Veg'],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]), { defaultCategory: 'Imported' })
  assert.equal(errors.length, 0)
  assert.equal(rows[0].category, 'Imported')
  assert.equal(rows[0].food_type, 'non_veg')
})

test('summarizeImport counts valid, invalid and distinct categories', () => {
  const summary = summarizeImport({
    rows: [{ category: 'A' }, { category: 'A' }, { category: 'B' }],
    errors: [{ messages: ['x'] }],
  })
  assert.deepEqual(summary, { valid: 3, invalid: 1, categories: 2 })
})

test('platformAuthEmailFromUsername maps to the synthetic founder domain', () => {
  assert.equal(
    platformAuthEmailFromUsername('  Founder '),
    'founder@platform.bsbdigitalmenu.local',
  )
})

test('validateFounderLogin rejects bad usernames and empty passwords', () => {
  assert.equal(validateFounderLogin({ username: '', password: 'x' }), 'Username required')
  assert.match(validateFounderLogin({ username: 'ab', password: 'x' }), /3/)
  assert.equal(validateFounderLogin({ username: 'founder', password: '' }), 'Password required')
  assert.equal(validateFounderLogin({ username: 'founder', password: 'secret1' }), '')
})

test('validateFounderPasswordChange enforces length, match and difference', () => {
  assert.match(
    validateFounderPasswordChange({ currentPassword: 'a', newPassword: 'short', confirmPassword: 'short' }),
    /10 characters/,
  )
  assert.equal(
    validateFounderPasswordChange({ currentPassword: 'a', newPassword: 'LongEnough1!', confirmPassword: 'Different12!' }),
    'Passwords do not match',
  )
  assert.match(
    validateFounderPasswordChange({ currentPassword: 'SamePass1!', newPassword: 'SamePass1!', confirmPassword: 'SamePass1!' }),
    /different/,
  )
  assert.equal(
    validateFounderPasswordChange({ currentPassword: 'OldPass12!', newPassword: 'NewPass12!', confirmPassword: 'NewPass12!' }),
    '',
  )
})

test('status metadata covers active/frozen/blocked/expired', () => {
  for (const status of ['active', 'frozen', 'blocked', 'expired']) {
    assert.ok(STATUS_META[status], `missing meta for ${status}`)
  }
})

test('remainingDaysLabel renders human readable values', () => {
  assert.equal(remainingDaysLabel(null), 'No expiry')
  assert.equal(remainingDaysLabel(1), '1 day left')
  assert.equal(remainingDaysLabel(5), '5 days left')
  assert.equal(remainingDaysLabel(0), 'Expired')
})
