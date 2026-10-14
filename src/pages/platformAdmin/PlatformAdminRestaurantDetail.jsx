import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import { getPlatformRestaurant } from '../../services/platformAdmin'
import { formatCount, formatDate, formatMoney, STATUS_META } from '../../lib/platformAdmin'

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
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: nextError } = await getPlatformRestaurant(restaurantId)
    if (nextError) {
      setError(nextError.message)
      setRestaurant(null)
    } else {
      setRestaurant(data?.restaurant || null)
    }
    setLoading(false)
  }, [restaurantId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">Loading restaurant...</div>
  }

  if (error || !restaurant) {
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
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {restaurant.restaurant_type || 'Restaurant'} · {restaurant.slug ? `/${restaurant.slug}` : 'No public slug'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Owner" value={restaurant.owner_username || '—'} />
        <Stat label="Phone" value={restaurant.phone || '—'} />
        <Stat label="Created" value={formatDate(restaurant.created_at)} />
        <Stat label="Tables" value={formatCount(restaurant.table_count)} />
        <Stat label="Menu items" value={formatCount(restaurant.menu_item_count)} />
        <Stat label="Waiters" value={formatCount(restaurant.waiter_count)} />
        <Stat label="Total orders" value={formatCount(restaurant.total_orders)} />
        <Stat label="Total revenue" value={formatMoney(restaurant.total_revenue)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-400">Address</dt>
            <dd className="text-sm text-slate-700">{restaurant.address || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Identity</dt>
            <dd className="break-all text-sm text-slate-700">{restaurant.id}</dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-slate-400">
        View-only. Editing, status changes and subscriptions are planned for a later phase.
      </p>
    </div>
  )
}
