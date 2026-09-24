import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import EmptyState from '../../../components/EmptyState'
import NavIcon from '../../../components/NavIcon'
import Spinner from '../../../components/Spinner'
import { TABLE_WISE_MODULES } from '../../../lib/tableWiseNav'
import { listTables } from '../../../services/tables'
import { listWaiters } from '../../../services/waiters'

export default function TableWiseHome() {
  const { restaurant, loading } = useOutletContext()
  const [tableCount, setTableCount] = useState(null)
  const [waiterCount, setWaiterCount] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!restaurant?.id) {
        setTableCount(null)
        setWaiterCount(null)
        setError('')
        return
      }
      const [tables, waiters] = await Promise.all([listTables(restaurant.id), listWaiters(restaurant.id)])
      if (!active) return
      setTableCount(tables.data?.length ?? 0)
      setWaiterCount(waiters.error ? null : waiters.data?.length ?? 0)
      setError(tables.error?.message || '')
    }
    load()
    return () => {
      active = false
    }
  }, [restaurant?.id])

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Table-wise order is scoped to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Operations</p>
        <h1 className="mt-1 font-display text-3xl">TABLE-WISE ORDER</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Manage tables, orders, kitchen activity and restaurant billing from one place.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TABLE_WISE_MODULES.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className="group rounded-2xl border border-line bg-card p-4 shadow-sm transition hover:border-forest/40 hover:shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-forest">
                <NavIcon name={item.icon} className="h-4 w-4" />
              </div>
              {item.key === 'tables' && tableCount !== null ? (
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  {tableCount} {tableCount === 1 ? 'table' : 'tables'}
                </span>
              ) : item.key === 'waiters' && waiterCount !== null ? (
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  {waiterCount} {waiterCount === 1 ? 'waiter' : 'waiters'}
                </span>
              ) : (
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  {item.ready ? 'Ready' : 'Next phase'}
                </span>
              )}
            </div>
            <h2 className="mt-3 font-display text-lg leading-tight">{item.label}</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {item.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-medium text-forest group-hover:underline">Open</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
