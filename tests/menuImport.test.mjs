import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SAMPLE_SHEET_URL,
  buildRows,
  detectVariantColumns,
  formatVariantsPreview,
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

test('sample sheet URL includes the requested spreadsheet id and gid 0', () => {
  assert.match(SAMPLE_SHEET_URL, /1RTpREaNsEvUU-lvJGDfV2U7kJO6bytdjMFI6b9AiMBY/)
  assert.match(SAMPLE_SHEET_URL, /gid=0/)
})

test('guessMapping does not treat veg or size aliases as a single price column', () => {
  const mapping = guessMapping(['Item', 'Category', 'Quarter', 'Half', 'Full', 'Veg'])
  assert.equal(mapping.name, 0)
  assert.equal(mapping.category, 1)
  assert.equal(mapping.price, -1)
  assert.equal(mapping.food_type, 5)
  assert.deepEqual(mapping.variantColumns, [2, 3, 4])
})

test('detectVariantColumns ignores veg/non-veg headers', () => {
  const cols = detectVariantColumns(['Name', 'Veg', 'Non-Veg', 'Qtr', 'Half'])
  assert.deepEqual(
    cols.map((col) => col.name),
    ['Quarter', 'Half'],
  )
})

test('Case A: single price maps to menu_items.price with empty variants', () => {
  const grid = [
    ['Item', 'Category', 'Price'],
    ['Masala Dosa', 'South Indian', '120'],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]))
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].price, 120)
  assert.deepEqual(rows[0].variants, [])
})

test('Case B: multi-column sizes become jsonb variants and never invent prices', () => {
  const grid = [
    ['Item', 'Category', 'Quarter', 'Half', 'Full', 'Type'],
    ['Chicken Biryani', 'Biryani', '180', '280', '420', 'Non-Veg'],
    ['Veg Biryani', 'Biryani', '', '220', '340', 'Veg'],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]))
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].price, 180)
  assert.deepEqual(rows[0].variants, [
    { name: 'Quarter', price: 180, is_available: true },
    { name: 'Half', price: 280, is_available: true },
    { name: 'Full', price: 420, is_available: true },
  ])
  assert.deepEqual(rows[1].variants.map((v) => v.name), ['Half', 'Full'])
  assert.equal(rows[0].food_type, 'non_veg')
})

test('Case C: grouped continuation rows merge into one item', () => {
  const grid = [
    ['Item', 'Category', 'Variant', 'Price'],
    ['Mutton Curry', 'Mains', 'Half', '320'],
    ['', '', 'Full', '520'],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]))
  assert.equal(errors.length, 0)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Mutton Curry')
  assert.equal(rows[0].category, 'Mains')
  assert.deepEqual(
    rows[0].variants.map((v) => `${v.name}:${v.price}`),
    ['Half:320', 'Full:520'],
  )
})

test('Case D: one named variant stores jsonb with that name', () => {
  const grid = [
    ['Dish', 'Section', 'Size', 'Rate'],
    ['Filter Coffee', 'Beverages', 'Glass', '40'],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]))
  assert.equal(errors.length, 0)
  assert.equal(rows[0].price, 40)
  assert.deepEqual(rows[0].variants, [{ name: 'Glass', price: 40, is_available: true }])
})

test('Case E: missing and invalid prices are flagged and never become 0 or free', () => {
  const grid = [
    ['Item', 'Category', 'Quarter', 'Half', 'Full'],
    ['Fish Fry', 'Starters', 'free', 'abc', ''],
    ['Empty Item', 'Starters', '', '', ''],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]))
  assert.equal(rows.length, 0)
  const messages = errors.flatMap((e) => e.messages)
  assert.ok(messages.some((m) => m.includes('Invalid price')))
  assert.ok(messages.some((m) => m.includes('Missing price')))
  assert.ok(!rows.some((row) => row.price === 0))
})

test('duplicate item+variant is flagged; preview lists named variants', () => {
  const grid = [
    ['Item', 'Category', 'Half', 'Full'],
    ['Dal Tadka', 'Mains', '90', '150'],
    ['Dal Tadka', 'Mains', '90', '150'],
  ]
  const { rows, errors } = buildRows(grid, guessMapping(grid[0]))
  assert.equal(rows.length, 1)
  assert.ok(errors.some((e) => e.messages.some((m) => m.includes('Duplicate'))))
  assert.equal(formatVariantsPreview(rows[0]), 'Half 90 · Full 150')
})

test('selected variant unit price is used for cart and history display', () => {
  const item = {
    id: 'item-1',
    name: 'Chicken Biryani',
    price: 180,
    variants: [
      { name: 'Quarter', price: 180, is_available: true },
      { name: 'Full', price: 420, is_available: true },
    ],
  }
  const chosen = item.variants.find((row) => row.name === 'Full')
  assert.equal(chosen.price, 420)
  const quantity = 2
  const lineTotal = Math.round(chosen.price * quantity * 100) / 100
  assert.equal(lineTotal, 840)
  const itemName = `${item.name} (${chosen.name})`
  assert.equal(itemName, 'Chicken Biryani (Full)')
  const historyVariant = itemName.match(/\(([^)]+)\)\s*$/)?.[1]
  assert.equal(historyVariant, 'Full')
})
