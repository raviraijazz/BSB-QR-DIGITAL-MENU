import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import { listPlatformRestaurants } from '../../services/platformAdmin'
import { formatDate, remainingDaysLabel, STATUS_META, STATUS_OPTIONS } from '../../lib/platformAdmin'

const PAGE_SIZE = 20

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.active
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

export default function PlatformAdminRestaurants() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: nextError } = await listPlatformRestaurants({ search: query, status, page, pageSize: PAGE_SIZE })
    if (nextError) {
      setError(nextError.message)
      setItems([])
      setTotal(0)
    } else {
      setItems(data?.items || [])
      setTotal(Number(data?.total) || 0)
    }
    setLoading(false)
  }, [query, status, page])

  useEffect(() => {
    load()
  }, [load])

  function onSearchSubmit(event) {
    event.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Restaurants</h1>
        <p className="mt-1 text-sm text-slate-500">
          Directory of every restaurant. Open a support session, manage access or import a menu.
        </p>
      </div>

      <Alert>{error}</Alert>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={onSearchSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px] text-xs font-medium text-slate-500">
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Restaurant or owner username"
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            Search
          </Button>
        </form>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          Loading restaurants...
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No restaurants found"
          body={query || status ? 'No restaurants match the current search and filters.' : 'No restaurants have been created yet.'}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Restaurant</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">Access</th>
                  <th className="px-5 py-3 font-medium">Validity</th>
                  <th className="px-5 py-3 font-medium">Counts</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/platform-admin/restaurants/${row.id}`} className="font-medium text-blue-700 hover:underline">
                        {row.name || 'Unnamed restaurant'}
                      </Link>
                      <p className="text-xs text-slate-400">{row.slug ? `/${row.slug}` : row.restaurant_type || 'No public slug'}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.owner_username || '—'}
                      {row.owner_blocked ? (
                        <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                          blocked
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <p>{row.valid_until ? formatDate(row.valid_until) : 'No expiry'}</p>
                      <p className="text-xs text-slate-400">{remainingDaysLabel(row.remaining_days)}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      <p>{row.table_count} tables</p>
                      <p>{row.menu_item_count} items</p>
                      <p>{row.waiter_count} waiters</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/platform-admin/support/${row.id}`)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Login to Panel
                        </button>
                        <Link
                          to={`/platform-admin/restaurants/${row.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Manage Access
                        </Link>
                        <Link
                          to={`/platform-admin/import-menu?restaurant=${row.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Import Menu
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Showing {start}–{end} of {total}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="grid place-items-center px-2 text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
