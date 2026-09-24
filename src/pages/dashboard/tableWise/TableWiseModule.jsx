import { Link, useLocation, useOutletContext } from 'react-router-dom'
import EmptyState from '../../../components/EmptyState'
import NavIcon from '../../../components/NavIcon'
import Spinner from '../../../components/Spinner'
import { TABLE_WISE_HOME, tableWiseModuleByPath } from '../../../lib/tableWiseNav'

export default function TableWiseModule() {
  const { restaurant, loading } = useOutletContext()
  const { pathname } = useLocation()
  const module = tableWiseModuleByPath(pathname)

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

  if (!module) {
    return (
      <EmptyState
        title="Module not found"
        body="Return to Table-wise order to choose a workspace."
        actionTo={TABLE_WISE_HOME}
        actionLabel="Table-wise order"
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
          Table-wise order
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-paper text-forest">
            <NavIcon name={module.icon} className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl leading-tight">{module.title || module.label}</h1>
            <p className="mt-1 text-sm text-muted">{restaurant.name}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-line bg-white/70 px-6 py-12 text-center">
        <h2 className="font-display text-xl">{module.title || module.label}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{module.body}</p>
        <p className="mx-auto mt-4 max-w-md text-xs text-muted">
          This workspace is ready for the next development phase. No orders, tickets, bills or payments are shown until that workflow is enabled.
        </p>
        <Link to={TABLE_WISE_HOME} className="mt-5 inline-block text-sm font-medium text-forest hover:underline">
          Back to operations
        </Link>
      </div>
    </div>
  )
}
