import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { getPlatformRestaurant, manageAccount, manageRestaurant } from '../../services/platformAdmin'
import {
  formatCount,
  formatDate,
  formatMoney,
  remainingDaysLabel,
  STATUS_META,
  VALIDITY_PRESETS,
} from '../../lib/platformAdmin'

function ConfirmDialog({ open, title, body, reasonLabel = 'Reason (optional)', allowDays, onConfirm, onClose, busy }) {
  const [reason, setReason] = useState('')
  const [days, setDays] = useState(365)

  useEffect(() => {
    if (open) {
      setReason('')
      setDays(365)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {body ? <p className="mt-2 text-sm text-slate-500">{body}</p> : null}
        {allowDays ? (
          <label className="mt-4 block text-xs font-medium text-slate-500">
            Duration (days)
            <input
              type="number"
              min="1"
              max="3650"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
        ) : null}
        <label className="mt-4 block text-xs font-medium text-slate-500">
          {reasonLabel}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={busy}
            onClick={() => onConfirm({ reason, days: Number(days) })}
          >
            {busy ? 'Working...' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export default function PlatformAdminRestaurantDetail() {
  const { restaurantId } = useParams()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: nextError } = await getPlatformRestaurant(restaurantId)
    if (nextError) {
      setError(nextError.message)
      setRestaurant(null)
    } else {
      setRestaurant(data.restaurant)
    }
    setLoading(false)
  }, [restaurantId])

  useEffect(() => {
    load()
  }, [load])

  async function runRestaurantAction(action, { days, reason } = {}) {
    setBusy(true)
    setError('')
    setNotice('')
    const { error: nextError } = await manageRestaurant(restaurantId, action, { days, reason })
    setBusy(false)
    setDialog(null)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setNotice(`Restaurant ${action.replace('_', ' ')} applied.`)
    load()
  }

  async function runAccountAction(targetUserId, accountType, action, reason = '') {
    setBusy(true)
    setError('')
    setNotice('')
    const { error: nextError } = await manageAccount(restaurantId, targetUserId, accountType, action, reason)
    setBusy(false)
    setDialog(null)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setNotice(`Account ${action} applied.`)
    load()
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">Loading restaurant...</div>
  }

  if (!restaurant) {
    return (
      <div className="space-y-4">
        <Alert>{error || 'Restaurant not found.'}</Alert>
        <Link to="/platform-admin/restaurants" className="text-sm text-blue-700 hover:underline">
          Back to restaurants
        </Link>
      </div>
    )
  }

  const statusMeta = STATUS_META[restaurant.status] || STATUS_META.active
  const owner = restaurant.owner

  return (
    <div className="space-y-6">
      <div>
        <Link to="/platform-admin/restaurants" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to restaurants
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{restaurant.name || 'Unnamed restaurant'}</h1>
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
          <span className="text-sm text-slate-500">{remainingDaysLabel(restaurant.remaining_days)}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {restaurant.restaurant_type || 'Restaurant'} · {restaurant.slug ? `/${restaurant.slug}` : 'No public slug'}
        </p>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Owner" value={restaurant.owner_username || owner?.username || '—'} />
        <Stat label="Plan" value={restaurant.plan_name || 'None'} />
        <Stat label="Validity until" value={restaurant.valid_until ? formatDate(restaurant.valid_until) : 'No expiry'} />
        <Stat label="Tables" value={formatCount(restaurant.table_count)} />
        <Stat label="Menu items" value={formatCount(restaurant.menu_item_count)} />
        <Stat label="Waiters" value={formatCount(restaurant.waiter_count)} />
        <Stat label="Total orders" value={formatCount(restaurant.total_orders)} />
        <Stat label="Total revenue" value={formatMoney(restaurant.total_revenue)} />
        <Stat label="Created" value={formatDate(restaurant.created_at)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Restaurant access control</h2>
        <p className="mt-1 text-xs text-slate-400">These actions affect the entire restaurant and are audited.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {restaurant.status === 'frozen' ? (
            <Button variant="secondary" onClick={() => setDialog({ kind: 'unfreeze' })}>
              Unfreeze restaurant
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setDialog({ kind: 'freeze' })}>
              Freeze restaurant
            </Button>
          )}
          {restaurant.status === 'blocked' ? (
            <Button variant="secondary" onClick={() => setDialog({ kind: 'unblock' })}>
              Unblock restaurant
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setDialog({ kind: 'block' })}>
              Block restaurant
            </Button>
          )}
          <Button variant="secondary" onClick={() => setDialog({ kind: 'renew' })}>
            Renew validity
          </Button>
        </div>
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-500">Set validity period</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {VALIDITY_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => runRestaurantAction('set_validity', { days: preset.days })}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDialog({ kind: 'set_validity' })}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Custom days…
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(`/platform-admin/support/${restaurantId}`)}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Login to Panel
          </button>
          <Link
            to={`/platform-admin/subscriptions?restaurant=${restaurantId}`}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Assign / Update plan
          </Link>
          <Link
            to={`/platform-admin/subscriptions/payments?restaurant=${restaurantId}`}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Create invoice
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Accounts in this restaurant</h2>
        <p className="mt-1 text-xs text-slate-400">Blocking a specific account affects only that user, not the restaurant.</p>

        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">
                Owner · {owner?.username || restaurant.owner_username || '—'}
              </p>
              <p className="text-xs text-slate-400">{owner?.is_blocked ? 'Blocked' : 'Active'}</p>
            </div>
            {owner?.is_blocked ? (
              <Button variant="secondary" onClick={() => setDialog({ kind: 'owner_unblock', ownerId: owner.id })}>
                Unblock owner
              </Button>
            ) : (
              <Button
                variant="danger"
                disabled={!owner?.id}
                onClick={() => setDialog({ kind: 'owner_block', ownerId: owner?.id })}
              >
                Block owner
              </Button>
            )}
          </div>

          {(restaurant.waiters || []).length === 0 ? (
            <p className="text-sm text-slate-400">No waiter accounts.</p>
          ) : (
            restaurant.waiters.map((waiter) => (
              <div
                key={waiter.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{waiter.full_name}</p>
                  <p className="text-xs text-slate-400">
                    Waiter ID {waiter.waiter_id} · {waiter.is_blocked ? 'Blocked' : waiter.is_active ? 'Active' : 'Disabled'}
                  </p>
                </div>
                {waiter.is_blocked ? (
                  <Button
                    variant="secondary"
                    onClick={() => runAccountAction(waiter.auth_user_id, 'waiter', 'unblock')}
                    disabled={busy || !waiter.auth_user_id}
                  >
                    Unblock
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    onClick={() => runAccountAction(waiter.auth_user_id, 'waiter', 'block')}
                    disabled={busy || !waiter.auth_user_id}
                  >
                    Block
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(dialog)}
        busy={busy}
        allowDays={dialog?.kind === 'set_validity' || dialog?.kind === 'renew'}
        title={
          {
            freeze: 'Freeze restaurant',
            unfreeze: 'Unfreeze restaurant',
            block: 'Block restaurant',
            unblock: 'Unblock restaurant',
            set_validity: 'Set validity period',
            renew: 'Renew validity',
            owner_block: 'Block owner account',
            owner_unblock: 'Unblock owner account',
          }[dialog?.kind] || 'Confirm'
        }
        body={
          dialog?.kind === 'block'
            ? 'Blocking disables the restaurant immediately and ends any support session.'
            : dialog?.kind === 'freeze'
              ? 'Freezing suspends access until you explicitly unfreeze it.'
              : 'This action is recorded in the audit trail.'
        }
        onConfirm={({ reason, days }) => {
          if (dialog.kind === 'set_validity' || dialog.kind === 'renew') runRestaurantAction(dialog.kind, { days, reason })
          else if (dialog.kind === 'owner_block') runAccountAction(dialog.ownerId, 'owner', 'block', reason)
          else if (dialog.kind === 'owner_unblock') runAccountAction(dialog.ownerId, 'owner', 'unblock', reason)
          else runRestaurantAction(dialog.kind, { reason })
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
