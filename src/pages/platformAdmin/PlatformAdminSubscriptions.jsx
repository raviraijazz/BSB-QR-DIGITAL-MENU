import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import {
  assignSubscription,
  getSubscriptionSettings,
  listPlatformRestaurants,
  listSubscriptionAssignments,
  listSubscriptionPlans,
  setSubscriptionPlanStatus,
  setSubscriptionSettings,
  upsertSubscriptionPlan,
} from '../../services/platformAdmin'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  remainingDaysLabel,
  STATUS_META,
} from '../../lib/platformAdmin'
import {
  BILLING_CYCLES,
  VALIDITY_DURATION_OPTIONS,
  assignmentPayload,
  billingCycleLabel,
  buildAssignmentPreview,
  featureLines,
  parseFeatureLines,
  planStatusLabel,
  restaurantNeedsValidity,
  toDateInputUtc,
  todayUtcDate,
  validateDefaultSettings,
  validatePlanInput,
} from '../../lib/subscriptionPlans'

const emptyPlanForm = {
  id: '',
  name: '',
  description: '',
  price_inr: '',
  billing_cycle: 'yearly',
  custom_cycle_days: '',
  features: '',
  max_waiters: '',
  status: 'active',
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.active
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function planFormFromRow(plan) {
  return {
    id: plan.id,
    name: plan.name || '',
    description: plan.description || '',
    price_inr: plan.price_inr === 0 || plan.price_inr ? String(plan.price_inr) : '',
    billing_cycle: plan.billing_cycle || 'yearly',
    custom_cycle_days: plan.custom_cycle_days ? String(plan.custom_cycle_days) : '',
    features: featureLines(plan.features),
    max_waiters: plan.max_waiters ? String(plan.max_waiters) : '',
    status: plan.status === 'inactive' ? 'inactive' : 'active',
  }
}

function PlanEditor({ form, setForm, error, busy, onSubmit, onCancel, isEdit }) {
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-500 sm:col-span-2">
        Plan name
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Price (INR)
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.price_inr}
          onChange={(e) => set('price_inr', e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Billing cycle
        <select
          value={form.billing_cycle}
          onChange={(e) => set('billing_cycle', e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
        >
          {BILLING_CYCLES.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {cycle.label}
            </option>
          ))}
        </select>
      </label>
      {form.billing_cycle === 'custom' ? (
        <label className="text-xs font-medium text-slate-500">
          Custom cycle (days)
          <input
            type="number"
            min="1"
            max="3650"
            value={form.custom_cycle_days}
            onChange={(e) => set('custom_cycle_days', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
          />
        </label>
      ) : null}
      <label className="text-xs font-medium text-slate-500">
        Status
        <select
          value={form.status}
          onChange={(e) => set('status', e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-500">
        Waiter limit (optional)
        <input
          type="number"
          min="1"
          value={form.max_waiters}
          onChange={(e) => set('max_waiters', e.target.value)}
          placeholder="Not enforced yet"
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
        />
      </label>
      <label className="text-xs font-medium text-slate-500 sm:col-span-2">
        Description
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
        />
      </label>
      <label className="text-xs font-medium text-slate-500 sm:col-span-2">
        Features (one per line, informational)
        <textarea
          value={form.features}
          onChange={(e) => set('features', e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
        />
      </label>
      {error ? <p className="sm:col-span-2 text-sm text-red-700">{error}</p> : null}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save plan' : 'Create plan'}
        </Button>
      </div>
    </form>
  )
}

function AssignDrawer({ open, restaurants, plans, selectedId, onClose, onAssigned }) {
  const [restaurantId, setRestaurantId] = useState('')
  const [planId, setPlanId] = useState('')
  const [changeValidity, setChangeValidity] = useState(false)
  const [startDate, setStartDate] = useState(toDateInputUtc(todayUtcDate()))
  const [durationId, setDurationId] = useState('days_365')
  const [customDays, setCustomDays] = useState('365')
  const [exactDate, setExactDate] = useState('')
  const [note, setNote] = useState('')
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const restaurant = restaurants.find((row) => row.id === restaurantId)
  const plan = plans.find((row) => row.id === planId)
  const needsValidity = restaurantNeedsValidity(restaurant)
  const willChangeValidity = changeValidity || needsValidity

  useEffect(() => {
    if (!open) return
    setRestaurantId(selectedId || '')
    setPlanId('')
    setChangeValidity(false)
    setStartDate(toDateInputUtc(todayUtcDate()))
    setDurationId('days_365')
    setCustomDays('365')
    setExactDate('')
    setNote('')
    setError('')
    setHistory([])
  }, [open, selectedId])

  useEffect(() => {
    if (!open || !restaurantId) {
      setHistory([])
      return
    }
    listSubscriptionAssignments(restaurantId).then(({ data, error: nextError }) => {
      if (nextError) setHistory([])
      else setHistory(data || [])
    })
  }, [open, restaurantId])

  useEffect(() => {
    if (restaurant?.plan_id && plans.some((row) => row.id === restaurant.plan_id && row.status === 'active')) {
      setPlanId(restaurant.plan_id)
    }
  }, [restaurant?.plan_id, plans])

  const previewResult = useMemo(
    () =>
      restaurant && plan
        ? buildAssignmentPreview({
            restaurant,
            plan,
            changeValidity: willChangeValidity,
            startDate,
            durationId,
            customDays,
            exactDate,
          })
        : { error: '', preview: null },
    [restaurant, plan, willChangeValidity, startDate, durationId, customDays, exactDate],
  )

  if (!open) return null

  const activePlans = plans.filter((row) => row.status === 'active')

  async function onConfirm() {
    if (!previewResult.preview || previewResult.error) {
      setError(previewResult.error || 'Review the assignment before confirming.')
      return
    }
    setBusy(true)
    setError('')
    const { error: nextError } = await assignSubscription(assignmentPayload(previewResult.preview, note))
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    onAssigned()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true">
      <button type="button" className="h-full flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Assign / Update Subscription</h2>
          <p className="mt-1 text-sm text-slate-500">Switching plans does not change expiry unless you turn that on.</p>
        </div>
        <div className="flex-1 space-y-4 px-5 py-4">
          <Alert>{error}</Alert>
          <label className="block text-xs font-medium text-slate-500">
            Restaurant
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">Select a restaurant…</option>
              {restaurants.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name || 'Unnamed restaurant'}
                </option>
              ))}
            </select>
          </label>
          {restaurant ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Access <StatusBadge status={restaurant.status} /> · {remainingDaysLabel(restaurant.remaining_days)}
              </p>
              <p className="mt-1">Current plan: {restaurant.plan_name || 'None'}</p>
              <p>
                Validity: {restaurant.valid_from ? formatDate(restaurant.valid_from) : '—'} →{' '}
                {restaurant.valid_until ? formatDate(restaurant.valid_until) : 'No expiry'}
              </p>
            </div>
          ) : null}
          <label className="block text-xs font-medium text-slate-500">
            Plan
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">Select a plan…</option>
              {activePlans.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {formatMoney(row.price_inr)} · {billingCycleLabel(row.billing_cycle, row.custom_cycle_days)}
                </option>
              ))}
            </select>
          </label>
          {plan ? (
            <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-800">{plan.name}</p>
              <p>
                {formatMoney(plan.price_inr)} · {billingCycleLabel(plan.billing_cycle, plan.custom_cycle_days)}
              </p>
              {plan.description ? <p className="mt-1">{plan.description}</p> : null}
              {Array.isArray(plan.features) && plan.features.length ? (
                <ul className="mt-2 list-disc pl-4 text-xs">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              ) : null}
              {plan.max_waiters ? (
                <p className="mt-2 text-xs text-slate-400">Waiter limit recorded: {plan.max_waiters} (not enforced yet)</p>
              ) : null}
            </div>
          ) : null}

          {needsValidity ? (
            <Alert type="info">This restaurant has no validity dates. Choose a duration before assigning.</Alert>
          ) : (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={changeValidity}
                onChange={(e) => setChangeValidity(e.target.checked)}
              />
              <span>
                Also change subscription validity
                <span className="block text-xs text-slate-400">Off by default. Plan switch alone keeps the current expiry.</span>
              </span>
            </label>
          )}

          {willChangeValidity ? (
            <div className="grid gap-3">
              <label className="text-xs font-medium text-slate-500">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Duration
                <select
                  value={durationId}
                  onChange={(e) => setDurationId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                >
                  {VALIDITY_DURATION_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {durationId === 'custom_days' ? (
                <label className="text-xs font-medium text-slate-500">
                  Custom days
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                  />
                </label>
              ) : null}
              {durationId === 'exact_date' ? (
                <label className="text-xs font-medium text-slate-500">
                  Expiry date
                  <input
                    type="date"
                    value={exactDate}
                    onChange={(e) => setExactDate(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {previewResult.preview ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700">
              {previewResult.preview.preserveExpiry ? (
                <p>
                  Switch to <span className="font-medium">{previewResult.preview.planName}</span>. Expiry stays{' '}
                  {formatDate(previewResult.preview.validUntil)}.
                </p>
              ) : (
                <p>
                  Assign <span className="font-medium">{previewResult.preview.planName}</span> from{' '}
                  {formatDate(previewResult.preview.validFrom)} to {formatDate(previewResult.preview.validUntil)}.
                </p>
              )}
              {previewResult.error ? <p className="mt-1 text-red-700">{previewResult.error}</p> : null}
            </div>
          ) : previewResult.error ? (
            <p className="text-sm text-red-700">{previewResult.error}</p>
          ) : null}

          <label className="block text-xs font-medium text-slate-500">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>

          {history.length ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Assignment history</h3>
              <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs text-slate-600">
                {history.map((row) => (
                  <li key={row.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="font-medium text-slate-800">{row.plan_name || 'Plan'}</p>
                    <p>
                      {row.source === 'registration' ? 'Registration' : 'Founder'} · {formatDateTime(row.created_at)}
                    </p>
                    <p>{row.change_validity ? `Validity ${formatDate(row.valid_until)}` : 'Plan only'}</p>
                    {row.note ? <p className="text-slate-400">{row.note}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={busy || !previewResult.preview || Boolean(previewResult.error)}
            onClick={onConfirm}
          >
            {busy ? 'Saving…' : 'Confirm'}
          </Button>
        </div>
      </aside>
    </div>
  )
}

export default function PlatformAdminSubscriptions() {
  const [searchParams] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [planForm, setPlanForm] = useState(null)
  const [planError, setPlanError] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(Boolean(searchParams.get('restaurant')))
  const [selectedRestaurant, setSelectedRestaurant] = useState(searchParams.get('restaurant') || '')
  const [defaultPlanId, setDefaultPlanId] = useState('')
  const [defaultDays, setDefaultDays] = useState('365')
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [planResult, restaurantResult, settingsResult] = await Promise.all([
      listSubscriptionPlans(false),
      listPlatformRestaurants({ pageSize: 100 }),
      getSubscriptionSettings(),
    ])
    if (planResult.error || restaurantResult.error || settingsResult.error) {
      setError(planResult.error?.message || restaurantResult.error?.message || settingsResult.error?.message)
    }
    setPlans(planResult.data || [])
    setRestaurants(restaurantResult.data?.items || [])
    const nextSettings = Array.isArray(settingsResult.data) ? settingsResult.data[0] : settingsResult.data
    setSettings(nextSettings || null)
    setDefaultPlanId(nextSettings?.default_plan_id || '')
    setDefaultDays(String(nextSettings?.default_duration_days || 365))
    setAutoEnabled(Boolean(nextSettings?.auto_assign_enabled))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function savePlan(event) {
    event.preventDefault()
    const payload = {
      ...planForm,
      features: parseFeatureLines(planForm.features),
    }
    const validation = validatePlanInput(payload)
    if (validation) {
      setPlanError(validation)
      return
    }
    setPlanBusy(true)
    setPlanError('')
    const { error: nextError } = await upsertSubscriptionPlan(payload)
    setPlanBusy(false)
    if (nextError) {
      setPlanError(nextError.message)
      return
    }
    setPlanForm(null)
    setNotice(planForm.id ? 'Plan updated.' : 'Plan created.')
    load()
  }

  async function changePlanStatus(plan, status) {
    setError('')
    setNotice('')
    const { error: nextError } = await setSubscriptionPlanStatus(plan.id, status)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setNotice(`${plan.name} marked ${planStatusLabel(status).toLowerCase()}.`)
    load()
  }

  async function saveSettings(event) {
    event.preventDefault()
    const validation = validateDefaultSettings({
      planId: defaultPlanId,
      durationDays: Number(defaultDays),
      enabled: autoEnabled,
      plans,
    })
    if (validation) {
      setSettingsError(validation)
      return
    }
    setSettingsBusy(true)
    setSettingsError('')
    const { error: nextError } = await setSubscriptionSettings({
      planId: defaultPlanId,
      durationDays: Number(defaultDays),
      enabled: autoEnabled,
    })
    setSettingsBusy(false)
    if (nextError) {
      setSettingsError(nextError.message)
      return
    }
    setNotice('Default registration settings saved. Existing restaurants are unchanged.')
    load()
  }

  const activePlans = plans.filter((row) => row.status === 'active')
  const defaultPlan = plans.find((row) => row.id === defaultPlanId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Subscription & Plans</h1>
        <p className="mt-1 text-sm text-slate-500">
          Founder-only catalog and restaurant assignment. Prices and names come from plans you create here. No sample
          plans are seeded. Plan pricing is not a payment collection record.
        </p>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>
      {settings?.last_assign_error ? <Alert>{settings.last_assign_error}</Alert> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Plans & Pricing</h2>
            <p className="mt-1 text-xs text-slate-400">Create plans first. Features and waiter limits are recorded, not auto-enforced.</p>
          </div>
          {planForm ? null : (
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setPlanForm(emptyPlanForm)}>
              New plan
            </Button>
          )}
        </div>
        {planForm ? (
          <PlanEditor
            form={planForm}
            setForm={setPlanForm}
            error={planError}
            busy={planBusy}
            isEdit={Boolean(planForm.id)}
            onCancel={() => {
              setPlanForm(null)
              setPlanError('')
            }}
            onSubmit={savePlan}
          />
        ) : null}
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Loading plans…</p>
        ) : plans.length === 0 && !planForm ? (
          <EmptyState title="No plans yet" body="Create a plan to assign it to restaurants or use it as the default for new registrations." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Cycle</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{plan.name}</p>
                      {plan.description ? <p className="text-xs text-slate-400">{plan.description}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatMoney(plan.price_inr)}</td>
                    <td className="px-3 py-3 text-slate-600">{billingCycleLabel(plan.billing_cycle, plan.custom_cycle_days)}</td>
                    <td className="px-3 py-3 text-slate-600">{planStatusLabel(plan.status)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs text-blue-700 hover:underline"
                          onClick={() => setPlanForm(planFormFromRow(plan))}
                        >
                          Edit
                        </button>
                        {plan.status === 'active' ? (
                          <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => changePlanStatus(plan, 'inactive')}>
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => changePlanStatus(plan, 'active')}>
                            Activate
                          </button>
                        )}
                        <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => changePlanStatus(plan, 'archived')}>
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Default for new restaurants</h2>
        <p className="mt-1 text-xs text-slate-400">
          Applies only to restaurants created after you save. Existing restaurants are never changed.
        </p>
        <form onSubmit={saveSettings} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            Default plan
            <select
              value={defaultPlanId}
              onChange={(e) => setDefaultPlanId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">No default plan</option>
              {activePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {formatMoney(plan.price_inr)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Default duration (days)
            <input
              type="number"
              min="1"
              max="3650"
              value={defaultDays}
              onChange={(e) => setDefaultDays(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" className="mt-0.5" checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} />
            <span>Automatically assign this plan and validity to new restaurant registrations</span>
          </label>
          {autoEnabled && defaultPlan ? (
            <p className="sm:col-span-2 text-sm text-slate-600">
              New restaurants will receive <span className="font-medium">{defaultPlan.name}</span> for {defaultDays} days.
              No payment record is created.
            </p>
          ) : null}
          {settingsError ? <p className="sm:col-span-2 text-sm text-red-700">{settingsError}</p> : null}
          <div className="sm:col-span-2">
            <Button className="bg-blue-600 hover:bg-blue-700" disabled={settingsBusy}>
              {settingsBusy ? 'Saving…' : 'Save default settings'}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Restaurant subscriptions</h2>
            <p className="mt-1 text-xs text-slate-400">Access status comes from freeze/block/expiry. Plan assignment is separate.</p>
          </div>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              setSelectedRestaurant('')
              setDrawerOpen(true)
            }}
          >
            Assign / Update
          </Button>
        </div>
        {restaurants.length === 0 ? (
          <EmptyState title="No restaurants yet" body="Restaurants appear here after owners register them." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Restaurant</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Access</th>
                  <th className="px-3 py-2 font-medium">Validity</th>
                  <th className="px-3 py-2 font-medium">Remaining</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {restaurants.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3">
                      <Link to={`/platform-admin/restaurants/${row.id}`} className="font-medium text-blue-700 hover:underline">
                        {row.name || 'Unnamed restaurant'}
                      </Link>
                      <p className="text-xs text-slate-400">{row.owner_username || 'No owner username'}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {row.plan_name || 'None'}
                      {row.plan_price_inr != null && row.plan_name ? (
                        <p className="text-xs text-slate-400">{formatMoney(row.plan_price_inr)}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {row.valid_from ? formatDate(row.valid_from) : '—'} → {row.valid_until ? formatDate(row.valid_until) : 'No expiry'}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{remainingDaysLabel(row.remaining_days)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="text-xs text-blue-700 hover:underline"
                        onClick={() => {
                          setSelectedRestaurant(row.id)
                          setDrawerOpen(true)
                        }}
                      >
                        Assign / Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AssignDrawer
        open={drawerOpen}
        restaurants={restaurants}
        plans={plans}
        selectedId={selectedRestaurant}
        onClose={() => setDrawerOpen(false)}
        onAssigned={() => {
          setNotice('Subscription updated.')
          load()
        }}
      />
    </div>
  )
}
