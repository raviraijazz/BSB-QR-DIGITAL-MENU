import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from '../src/lib/csv.js'
import {
  billingUnavailable,
  chooseBucket,
  collectedFromPaymentRows,
  emptyReport,
  gmvNeverIncludesSubscription,
  isValidityRenewal,
  normalizeReport,
  operationalOrderCount,
  planSwitchIsNotRenewal,
  reportFilename,
  restaurantCsvColumns,
  seriesToChart,
  utcRangeFromDateKeys,
} from '../src/lib/platformReports.js'

test('utc date keys are inclusive of the end day and exclusive after midnight', () => {
  const range = utcRangeFromDateKeys('2026-04-01', '2026-04-01')
  assert.equal(range.error, '')
  assert.equal(range.from, '2026-04-01T00:00:00.000Z')
  assert.equal(range.toExclusive, '2026-04-02T00:00:00.000Z')
})

test('invalid and reversed date keys are rejected', () => {
  assert.equal(utcRangeFromDateKeys('', '2026-04-01').error, 'Choose a start date and end date')
  assert.equal(utcRangeFromDateKeys('2026-04-10', '2026-04-01').error, 'End date cannot be before the start date')
})

test('bucket choice follows range length', () => {
  assert.equal(chooseBucket('2026-04-01', '2026-04-10'), 'day')
  assert.equal(chooseBucket('2026-01-01', '2026-02-15'), 'week')
  assert.equal(chooseBucket('2026-01-01', '2026-12-31'), 'month')
})

test('frozen and blocked are never counted as active in status maps', () => {
  const report = normalizeReport({
    kpis: { status: { active: 4, frozen: 2, blocked: 1, expired: 3, other: 0 }, restaurants_total: 10 },
  })
  assert.equal(report.kpis.status.active, 4)
  assert.equal(report.kpis.status.frozen, 2)
  assert.equal(report.kpis.status.blocked, 1)
  assert.notEqual(report.kpis.status.active, report.kpis.restaurants_total)
})

test('operational order count excludes cancelled unless the cancelled filter is on', () => {
  const kpis = { orders: 12, orders_cancelled: 3 }
  assert.equal(operationalOrderCount(kpis, false), 9)
  assert.equal(operationalOrderCount(kpis, true), 12)
})

test('subscription collected uses payment rows so partials are not double-counted', () => {
  const rows = [
    { amount_inr: 400, kind: 'payment' },
    { amount_inr: 600, kind: 'payment' },
    { amount_inr: 100, kind: 'refund' },
  ]
  assert.equal(collectedFromPaymentRows(rows), 900)
})

test('customer GMV is not treated as subscription collected', () => {
  assert.equal(gmvNeverIncludesSubscription(1500, 200), true)
  assert.equal(gmvNeverIncludesSubscription(0, 0), true)
})

test('plan switch without change_validity is not a renewal', () => {
  assert.equal(isValidityRenewal({ change_validity: false, plan_id: 'p2' }), false)
  assert.equal(planSwitchIsNotRenewal({ change_validity: false, plan_id: 'p2' }), true)
  assert.equal(isValidityRenewal({ change_validity: true, plan_id: 'p2' }), true)
})

test('missing billing source is reported rather than invented', () => {
  assert.equal(billingUnavailable(emptyReport().billing), true)
  assert.equal(emptyReport().billing.dependency, 'supabase/subscription-billing.sql')
  assert.equal(billingUnavailable({ available: true, collected: 0 }), false)
})

test('CSV export of filtered restaurant rows matches displayed columns', () => {
  const rows = [
    {
      id: 'r1',
      name: 'Cafe One',
      created_at: '2026-04-01T10:00:00.000Z',
      status: 'active',
      plan_name: 'Gold',
      valid_until: '2027-04-01T00:00:00.000Z',
      order_count: 4,
      gmv: 1200,
    },
  ]
  const csv = toCsv(restaurantCsvColumns(), rows)
  assert.match(csv, /Restaurant,Restaurant ID,Registered,Access status,Plan,Valid until,Orders in period,Customer collections \(INR\)/)
  assert.match(csv, /Cafe One,r1,2026-04-01,active,Gold,2027-04-01,4,1200/)
})

test('series chart rows follow the filtered dataset', () => {
  const chart = seriesToChart(
    [
      { bucket: '2026-04-01', count: 2 },
      { bucket: '2026-04-02', count: 5 },
    ],
    'count',
  )
  assert.equal(chart.length, 2)
  assert.equal(chart[1].amount, 5)
  assert.equal(chart[1].key, '2026-04-02')
})

test('report filename includes the filtered range', () => {
  assert.equal(reportFilename('platform-restaurants', '2026-04-01', '2026-04-30'), 'platform-restaurants-2026-04-01-to-2026-04-30.csv')
})
