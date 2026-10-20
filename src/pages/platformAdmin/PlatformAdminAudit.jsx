import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import { listAudit } from '../../services/platformAdmin'
import { formatDateTime } from '../../lib/platformAdmin'

const PAGE_SIZE = 50

const ACTION_LABELS = {
  founder_login: 'Founder login',
  support_start: 'Support session started',
  support_end: 'Support session ended',
  restaurant_freeze: 'Restaurant frozen',
  restaurant_unfreeze: 'Restaurant unfrozen',
  restaurant_block: 'Restaurant blocked',
  restaurant_unblock: 'Restaurant unblocked',
  restaurant_set_validity: 'Validity set',
  restaurant_renew: 'Validity renewed',
  owner_block: 'Owner blocked',
  owner_unblock: 'Owner unblocked',
  waiter_block: 'Waiter blocked',
  waiter_unblock: 'Waiter unblocked',
  menu_import: 'Menu imported',
  plan_create: 'Plan created',
  plan_update: 'Plan updated',
  plan_status: 'Plan status changed',
  subscription_assign: 'Subscription assigned',
  subscription_switch: 'Subscription switched',
  subscription_settings: 'Default subscription settings updated',
  change_password: 'Password changed',
  view_restaurant: 'Restaurant viewed',
}

export default function PlatformAdminAudit() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: nextError } = await listAudit({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
    if (nextError) {
      setError(nextError.message)
      setRows([])
      setTotal(0)
    } else {
      setRows(data || [])
      setTotal(data?.length ? Number(data[0].total_count) : 0)
    }
    setLoading(false)
  }, [page])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Audit Trail</h1>
        <p className="mt-1 text-sm text-slate-500">
          Access changes, support sessions and imports. Restricted to platform admins.
        </p>
      </div>

      <Alert>{error}</Alert>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          Loading audit history...
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No audit entries yet" body="Administrative actions will appear here." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Founder</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Restaurant</th>
                  <th className="px-5 py-3 font-medium">Reason / details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500">{formatDateTime(row.created_at)}</td>
                    <td className="px-5 py-3 text-slate-600">{row.actor_username || '—'}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{ACTION_LABELS[row.action] || row.action}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.target_restaurant_id ? (
                        <Link to={`/platform-admin/restaurants/${row.target_restaurant_id}`} className="text-blue-700 hover:underline">
                          {row.target_restaurant_name || 'Restaurant'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {row.reason ? <span>{row.reason} </span> : null}
                      {row.details && Object.keys(row.details).length ? (
                        <span className="text-slate-400">{JSON.stringify(row.details)}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{total} entries</p>
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
