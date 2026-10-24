import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addCalendarMonths,
  addCalendarYears,
  assignmentPayload,
  billingCycleLabel,
  buildAssignmentPreview,
  buildPlanUpsertArgs,
  computeValidUntil,
  durationFromOption,
  durationIdFromDays,
  parseDateInput,
  parseFeatureLines,
  restaurantNeedsValidity,
  submitPlanForm,
  toDateInputUtc,
  validateDefaultSettings,
  validatePlanInput,
} from '../src/lib/subscriptionPlans.js'

test('validatePlanInput requires name, non-negative price and a billing cycle', () => {
  assert.equal(validatePlanInput({ name: '', price_inr: 0, billing_cycle: 'monthly' }), 'Plan name is required')
  assert.equal(validatePlanInput({ name: 'Gold', price_inr: -1, billing_cycle: 'monthly' }), 'Enter a valid price in INR')
  assert.equal(validatePlanInput({ name: 'Gold', price_inr: 0, billing_cycle: 'weekly' }), 'Select a billing cycle')
  assert.equal(
    validatePlanInput({ name: 'Gold', price_inr: 100, billing_cycle: 'custom', custom_cycle_days: 0 }),
    'Custom cycle must be between 1 and 3650 days',
  )
  assert.equal(validatePlanInput({ name: 'Gold', price_inr: 100, billing_cycle: 'yearly' }), '')
})

test('validatePlanInput accepts zero price and optional waiter limit', () => {
  assert.equal(validatePlanInput({ name: 'Trial', price_inr: 0, billing_cycle: 'monthly', max_waiters: '' }), '')
  assert.equal(
    validatePlanInput({ name: 'Trial', price_inr: 0, billing_cycle: 'monthly', max_waiters: 0 }),
    'Waiter limit must be a whole number of 1 or more',
  )
  assert.equal(
    validatePlanInput({ name: 'Trial', price_inr: 0, billing_cycle: 'yearly', default_duration_days: 365 }),
    '',
  )
  assert.equal(
    validatePlanInput({ name: 'Trial', price_inr: 0, billing_cycle: 'yearly', default_duration_days: 0 }),
    'Default validity must be between 1 and 3650 days',
  )
})

test('submitPlanForm saves a yearly plan and only then reports success', async () => {
  const form = {
    id: '',
    name: 'YEARLY',
    description: '',
    price_inr: '12999',
    billing_cycle: 'yearly',
    custom_cycle_days: '',
    features: '',
    max_waiters: '',
    default_duration_days: '',
    status: 'active',
  }
  const calls = []
  const result = await submitPlanForm(form, async (payload) => {
    calls.push(payload)
    return { data: { id: 'plan-1', ...payload }, error: null }
  })
  assert.equal(result.ok, true)
  assert.equal(result.keepForm, false)
  assert.equal(result.notice, 'Plan created.')
  assert.equal(result.error, '')
  assert.equal(calls.length, 1)
  assert.deepEqual(buildPlanUpsertArgs(calls[0]), {
    p_id: null,
    p_name: 'YEARLY',
    p_description: '',
    p_price_inr: 12999,
    p_billing_cycle: 'yearly',
    p_custom_cycle_days: null,
    p_features: [],
    p_max_waiters: null,
    p_status: 'active',
    p_default_duration_days: null,
  })
})

test('submitPlanForm keeps the form and surfaces the save error', async () => {
  const form = {
    id: '',
    name: 'YEARLY',
    description: 'Kept on failure',
    price_inr: '12999',
    billing_cycle: 'yearly',
    custom_cycle_days: '',
    features: 'QR menu',
    max_waiters: '',
    default_duration_days: '',
    status: 'active',
  }
  const result = await submitPlanForm(form, async () => ({
    data: null,
    error: new Error('Could not find the function public.platform_upsert_plan'),
  }))
  assert.equal(result.ok, false)
  assert.equal(result.keepForm, true)
  assert.equal(result.notice, '')
  assert.equal(result.error, 'Could not find the function public.platform_upsert_plan')
  assert.equal(result.payload.name, 'YEARLY')
  assert.equal(result.payload.price_inr, '12999')
})

test('submitPlanForm does not call save when required fields are missing', async () => {
  let called = false
  const result = await submitPlanForm(
    { name: '', price_inr: '12999', billing_cycle: 'yearly', features: '' },
    async () => {
      called = true
      return { data: { id: 'should-not-save' }, error: null }
    },
  )
  assert.equal(called, false)
  assert.equal(result.ok, false)
  assert.equal(result.keepForm, true)
  assert.equal(result.error, 'Plan name is required')
})

test('durationIdFromDays maps known presets and custom days', () => {
  assert.deepEqual(durationIdFromDays(7), { id: 'days_7', customDays: '7' })
  assert.deepEqual(durationIdFromDays(365), { id: 'days_365', customDays: '365' })
  assert.deepEqual(durationIdFromDays(12), { id: 'custom_days', customDays: '12' })
  assert.equal(durationIdFromDays(''), null)
})

test('billingCycleLabel and feature lines stay founder-defined', () => {
  assert.equal(billingCycleLabel('yearly'), 'Yearly')
  assert.equal(billingCycleLabel('custom', 14), 'Every 14 days')
  assert.deepEqual(parseFeatureLines('  QR menu  \n\nWaiter app\n'), ['QR menu', 'Waiter app'])
})

test('calendar month and year additions preserve month-end and leap years', () => {
  const jan31 = parseDateInput('2024-01-31')
  const feb = addCalendarMonths(jan31, 1)
  assert.equal(toDateInputUtc(feb), '2024-02-29')
  const leap = parseDateInput('2024-02-29')
  assert.equal(toDateInputUtc(addCalendarYears(leap, 1)), '2025-02-28')
  const nonLeap = parseDateInput('2025-01-31')
  assert.equal(toDateInputUtc(addCalendarMonths(nonLeap, 1)), '2025-02-28')
})

test('computeValidUntil covers 7, 10, month, 1/2/3 year and exact date', () => {
  const start = parseDateInput('2026-03-10')
  assert.equal(toDateInputUtc(computeValidUntil({ start, kind: 'days', amount: 7 }).end), '2026-03-17')
  assert.equal(toDateInputUtc(computeValidUntil({ start, kind: 'days', amount: 10 }).end), '2026-03-20')
  assert.equal(toDateInputUtc(computeValidUntil({ start, kind: 'months', amount: 1 }).end), '2026-04-10')
  assert.equal(toDateInputUtc(computeValidUntil({ start, kind: 'years', amount: 1 }).end), '2027-03-10')
  assert.equal(toDateInputUtc(computeValidUntil({ start, kind: 'years', amount: 2 }).end), '2028-03-10')
  assert.equal(toDateInputUtc(computeValidUntil({ start, kind: 'years', amount: 3 }).end), '2029-03-10')
  const exact = computeValidUntil({ start, kind: 'exact_date', endDate: parseDateInput('2026-12-31') })
  assert.equal(toDateInputUtc(exact.end), '2026-12-31')
  const sameDay = computeValidUntil({ start, kind: 'exact_date', endDate: parseDateInput('2026-03-10') })
  assert.equal(sameDay.error, '')
  assert.equal(toDateInputUtc(sameDay.end), '2026-03-10')
  assert.equal(
    computeValidUntil({ start, kind: 'exact_date', endDate: parseDateInput('2026-03-09') }).error,
    'Expiry date must be after the start date',
  )
})

test('durationFromOption maps custom days and exact date', () => {
  assert.deepEqual(durationFromOption('days_7'), { kind: 'days', amount: 7, endDate: null })
  assert.deepEqual(durationFromOption('custom_days', 12), { kind: 'days', amount: 12, endDate: null })
  const exact = durationFromOption('exact_date', '', '2026-06-01')
  assert.equal(exact.kind, 'exact_date')
  assert.equal(toDateInputUtc(exact.endDate), '2026-06-01')
})

test('switching plans preserves existing validity unless changeValidity is on', () => {
  const restaurant = {
    id: 'r1',
    plan_id: 'plan-a',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2026-12-31T23:59:59.000Z',
  }
  const planB = { id: 'plan-b', name: 'Plan B', status: 'active' }
  const preserved = buildAssignmentPreview({
    restaurant,
    plan: planB,
    changeValidity: false,
    startDate: '2026-04-01',
    durationId: 'year_1',
  })
  assert.equal(preserved.error, '')
  assert.equal(preserved.preview.preserveExpiry, true)
  assert.equal(preserved.preview.changeValidity, false)
  assert.equal(preserved.preview.validFrom, restaurant.valid_from)
  assert.equal(preserved.preview.validUntil, restaurant.valid_until)

  const withSuggestedDuration = buildAssignmentPreview({
    restaurant,
    plan: { ...planB, default_duration_days: 30 },
    changeValidity: false,
    startDate: '2026-04-01',
    durationId: 'days_30',
  })
  assert.equal(withSuggestedDuration.preview.preserveExpiry, true)
  assert.equal(withSuggestedDuration.preview.validUntil, restaurant.valid_until)

  const changed = buildAssignmentPreview({
    restaurant,
    plan: planB,
    changeValidity: true,
    startDate: '2026-04-01',
    durationId: 'days_7',
  })
  assert.equal(changed.error, '')
  assert.equal(changed.preview.changeValidity, true)
  assert.equal(changed.preview.validFrom, '2026-04-01T00:00:00.000Z')
  assert.equal(toDateInputUtc(new Date(changed.preview.validUntil)), '2026-04-08')
})

test('new assignment without validity requires an explicit duration', () => {
  const restaurant = { id: 'r2' }
  const plan = { id: 'plan-a', name: 'Plan A', status: 'active' }
  const missing = buildAssignmentPreview({
    restaurant,
    plan,
    changeValidity: false,
    startDate: '2026-04-01',
    durationId: 'year_1',
  })
  assert.match(missing.error, /no validity dates/i)
  assert.equal(restaurantNeedsValidity(restaurant), true)

  const assigned = buildAssignmentPreview({
    restaurant,
    plan,
    changeValidity: true,
    startDate: '2026-04-01',
    durationId: 'year_1',
  })
  assert.equal(assigned.error, '')
  assert.equal(toDateInputUtc(new Date(assigned.preview.validUntil)), '2027-04-01')
})

test('inactive plans and duplicate same-plan without validity change are rejected', () => {
  const restaurant = {
    id: 'r1',
    plan_id: 'plan-a',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2026-12-31T23:59:59.000Z',
  }
  assert.match(
    buildAssignmentPreview({
      restaurant,
      plan: { id: 'plan-b', name: 'Off', status: 'inactive' },
      changeValidity: false,
    }).error,
    /active plan/i,
  )
  assert.match(
    buildAssignmentPreview({
      restaurant,
      plan: { id: 'plan-a', name: 'Plan A', status: 'active' },
      changeValidity: false,
    }).error,
    /already on that plan/i,
  )
})

test('assignmentPayload only sends validity when the founder opted in', () => {
  const preview = {
    restaurantId: 'r1',
    planId: 'p1',
    changeValidity: false,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2026-12-31T23:59:59.000Z',
  }
  assert.deepEqual(assignmentPayload(preview, ' note '), {
    p_restaurant_id: 'r1',
    p_plan_id: 'p1',
    p_change_validity: false,
    p_valid_from: null,
    p_valid_until: null,
    p_note: 'note',
  })
})

test('validateDefaultSettings requires an active plan only when enabled', () => {
  const plans = [{ id: 'p1', status: 'active' }, { id: 'p2', status: 'inactive' }]
  assert.equal(validateDefaultSettings({ planId: '', durationDays: 365, enabled: false, plans }), '')
  assert.match(
    validateDefaultSettings({ planId: '', durationDays: 365, enabled: true, plans }),
    /active plan/,
  )
  assert.match(
    validateDefaultSettings({ planId: 'p2', durationDays: 365, enabled: true, plans }),
    /must be active/,
  )
  assert.equal(validateDefaultSettings({ planId: 'p1', durationDays: 365, enabled: true, plans }), '')
  assert.match(validateDefaultSettings({ planId: 'p1', durationDays: 0, enabled: false, plans }), /1 and 3650/)
})
