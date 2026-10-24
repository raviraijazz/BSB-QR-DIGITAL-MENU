export const BILLING_CYCLES = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'custom', label: 'Custom cycle' },
]

export const PLAN_STATUSES = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'archived', label: 'Archived' },
]

export const VALIDITY_DURATION_OPTIONS = [
  { id: 'days_7', kind: 'days', amount: 7, label: '7 days' },
  { id: 'days_10', kind: 'days', amount: 10, label: '10 days' },
  { id: 'days_30', kind: 'days', amount: 30, label: '30 days' },
  { id: 'month_1', kind: 'months', amount: 1, label: '1 calendar month' },
  { id: 'days_90', kind: 'days', amount: 90, label: '90 days' },
  { id: 'days_180', kind: 'days', amount: 180, label: '180 days' },
  { id: 'days_365', kind: 'days', amount: 365, label: '365 days' },
  { id: 'year_1', kind: 'years', amount: 1, label: '1 year' },
  { id: 'year_2', kind: 'years', amount: 2, label: '2 years' },
  { id: 'year_3', kind: 'years', amount: 3, label: '3 years' },
  { id: 'custom_days', kind: 'custom_days', amount: null, label: 'Custom number of days' },
  { id: 'exact_date', kind: 'exact_date', amount: null, label: 'Exact end date' },
]

export function billingCycleLabel(cycle, customDays) {
  if (cycle === 'monthly') return 'Monthly'
  if (cycle === 'yearly') return 'Yearly'
  if (cycle === 'custom') {
    const days = Number(customDays)
    if (Number.isInteger(days) && days > 0) return `Every ${days} day${days === 1 ? '' : 's'}`
    return 'Custom cycle'
  }
  return '—'
}

export function planStatusLabel(status) {
  const row = PLAN_STATUSES.find((item) => item.id === status)
  return row ? row.label : '—'
}

export function parseFeatureLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function featureLines(features) {
  if (Array.isArray(features)) return features.map((item) => String(item || '').trim()).filter(Boolean).join('\n')
  return ''
}

export function parseDateInput(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

export function toDateInputUtc(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayUtcDate() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function endOfUtcDate(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 0))
}

export function addCalendarMonths(date, amount) {
  const months = Number(amount)
  if (!Number.isInteger(months) || months === 0) return new Date(date.getTime())
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const result = new Date(
    Date.UTC(year, month + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()),
  )
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export function addCalendarYears(date, amount) {
  return addCalendarMonths(date, Number(amount) * 12)
}

export function addDaysUtc(date, amount) {
  const days = Number(amount)
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function computeValidUntil({ start, kind, amount, endDate }) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    return { error: 'Start date is required', end: null }
  }
  if (kind === 'days' || kind === 'custom_days') {
    const days = Number(amount)
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return { error: 'Duration must be between 1 and 3650 days', end: null }
    }
    return { error: '', end: addDaysUtc(start, days) }
  }
  if (kind === 'months') {
    const months = Number(amount)
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      return { error: 'Enter a valid number of months', end: null }
    }
    return { error: '', end: addCalendarMonths(start, months) }
  }
  if (kind === 'years') {
    const years = Number(amount)
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      return { error: 'Enter a valid number of years', end: null }
    }
    return { error: '', end: addCalendarYears(start, years) }
  }
  if (kind === 'exact_date') {
    const end = endDate instanceof Date ? endOfUtcDate(endDate) : null
    if (!end) return { error: 'Choose an expiry date', end: null }
    if (end.getTime() <= start.getTime()) return { error: 'Expiry date must be after the start date', end: null }
    return { error: '', end }
  }
  return { error: 'Choose a validity duration', end: null }
}

export function durationFromOption(optionId, customDays, exactDate) {
  const option = VALIDITY_DURATION_OPTIONS.find((row) => row.id === optionId) || VALIDITY_DURATION_OPTIONS[0]
  if (option.kind === 'custom_days') {
    return { kind: 'days', amount: Number(customDays), endDate: null }
  }
  if (option.kind === 'exact_date') {
    return { kind: 'exact_date', amount: null, endDate: parseDateInput(exactDate) }
  }
  return { kind: option.kind, amount: option.amount, endDate: null }
}

export function validatePlanInput(input) {
  const name = String(input?.name || '').trim()
  if (!name) return 'Plan name is required'
  if (name.length > 80) return 'Plan name is too long'
  const price = Number(input?.price_inr)
  if (!Number.isFinite(price) || price < 0) return 'Enter a valid price in INR'
  const cycle = String(input?.billing_cycle || '')
  if (!BILLING_CYCLES.some((row) => row.id === cycle)) return 'Select a billing cycle'
  if (cycle === 'custom') {
    const days = Number(input?.custom_cycle_days)
    if (!Number.isInteger(days) || days < 1 || days > 3650) return 'Custom cycle must be between 1 and 3650 days'
  }
  const waiters = input?.max_waiters
  if (waiters !== '' && waiters != null && waiters !== undefined) {
    const n = Number(waiters)
    if (!Number.isInteger(n) || n < 1 || n > 10000) return 'Waiter limit must be a whole number of 1 or more'
  }
  const defaultDays = input?.default_duration_days
  if (defaultDays !== '' && defaultDays != null && defaultDays !== undefined) {
    const n = Number(defaultDays)
    if (!Number.isInteger(n) || n < 1 || n > 3650) return 'Default validity must be between 1 and 3650 days'
  }
  const status = String(input?.status || 'active')
  if (!['active', 'inactive'].includes(status)) return 'Select active or inactive'
  return ''
}

export function planFormPayload(form) {
  return {
    ...form,
    features: parseFeatureLines(form?.features),
  }
}

export function buildPlanUpsertArgs(plan) {
  return {
    p_id: plan.id || null,
    p_name: plan.name,
    p_description: plan.description || '',
    p_price_inr: Number(plan.price_inr),
    p_billing_cycle: plan.billing_cycle,
    p_custom_cycle_days: plan.billing_cycle === 'custom' ? Number(plan.custom_cycle_days) : null,
    p_features: Array.isArray(plan.features) ? plan.features : [],
    p_max_waiters: plan.max_waiters === '' || plan.max_waiters == null ? null : Number(plan.max_waiters),
    p_status: plan.status || 'active',
    p_default_duration_days:
      plan.default_duration_days === '' || plan.default_duration_days == null
        ? null
        : Number(plan.default_duration_days),
  }
}

export async function submitPlanForm(form, save) {
  const payload = planFormPayload(form)
  const validation = validatePlanInput(payload)
  if (validation) {
    return { ok: false, error: validation, keepForm: true, notice: '', payload }
  }
  const { error } = await save(payload)
  if (error) {
    return {
      ok: false,
      error: error.message || String(error),
      keepForm: true,
      notice: '',
      payload,
    }
  }
  return {
    ok: true,
    error: '',
    keepForm: false,
    notice: form?.id ? 'Plan updated.' : 'Plan created.',
    payload,
  }
}

export function durationIdFromDays(days) {
  const n = Number(days)
  if (!Number.isInteger(n) || n < 1) return null
  const match = VALIDITY_DURATION_OPTIONS.find((row) => row.kind === 'days' && row.amount === n)
  if (match) return { id: match.id, customDays: String(n) }
  return { id: 'custom_days', customDays: String(n) }
}

export function validateDefaultSettings({ planId, durationDays, enabled, plans }) {
  const days = Number(durationDays)
  if (!Number.isInteger(days) || days < 1 || days > 3650) return 'Default duration must be between 1 and 3650 days'
  if (!enabled) return ''
  if (!planId) return 'Select an active plan before enabling automatic assignment'
  const plan = (plans || []).find((row) => row.id === planId)
  if (!plan) return 'Select an active plan before enabling automatic assignment'
  if (plan.status !== 'active') return 'The default plan must be active'
  return ''
}

export function restaurantNeedsValidity(restaurant) {
  return !restaurant?.valid_from && !restaurant?.valid_until
}

export function buildAssignmentPreview({
  restaurant,
  plan,
  changeValidity,
  startDate,
  durationId,
  customDays,
  exactDate,
}) {
  if (!restaurant?.id) return { error: 'Select a restaurant', preview: null }
  if (!plan?.id) return { error: 'Select a plan', preview: null }
  if (plan.status !== 'active') return { error: 'Only an active plan can be assigned', preview: null }

  const needsValidity = restaurantNeedsValidity(restaurant)
  const willChangeValidity = Boolean(changeValidity) || needsValidity
  if (needsValidity && !changeValidity) {
    return { error: 'This restaurant has no validity dates. Choose a duration before assigning.', preview: null }
  }

  const samePlan = restaurant.plan_id && restaurant.plan_id === plan.id
  if (samePlan && !willChangeValidity) {
    return { error: 'This restaurant is already on that plan. Enable validity change to renew or extend.', preview: null }
  }

  let nextFrom = restaurant.valid_from || null
  let nextUntil = restaurant.valid_until || null
  if (willChangeValidity) {
    const start = parseDateInput(startDate) || todayUtcDate()
    const duration = durationFromOption(durationId, customDays, exactDate)
    const computed = computeValidUntil({
      start,
      kind: duration.kind,
      amount: duration.amount,
      endDate: duration.endDate,
    })
    if (computed.error) return { error: computed.error, preview: null }
    nextFrom = start.toISOString()
    nextUntil = computed.end.toISOString()
  }

  return {
    error: '',
    preview: {
      restaurantId: restaurant.id,
      planId: plan.id,
      planName: plan.name,
      changeValidity: willChangeValidity,
      preserveExpiry: !willChangeValidity,
      validFrom: nextFrom,
      validUntil: nextUntil,
      previousValidFrom: restaurant.valid_from || null,
      previousValidUntil: restaurant.valid_until || null,
    },
  }
}

export function assignmentPayload(preview, note) {
  if (!preview) return null
  return {
    p_restaurant_id: preview.restaurantId,
    p_plan_id: preview.planId,
    p_change_validity: Boolean(preview.changeValidity),
    p_valid_from: preview.changeValidity ? preview.validFrom : null,
    p_valid_until: preview.changeValidity ? preview.validUntil : null,
    p_note: String(note || '').trim(),
  }
}
