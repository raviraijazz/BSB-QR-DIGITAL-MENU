import { useOutletContext } from 'react-router-dom'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import { tableHeading } from '../../lib/tableToken'

export default function WaiterHome() {
  const { waiter, restaurant, tables } = useOutletContext()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Waiter</p>
        <h1 className="mt-1 font-display text-3xl">{waiter?.full_name || 'Waiter'}</h1>
        <p className="mt-1 font-mono text-sm text-muted">{waiter?.waiter_id}</p>
        <p className="mt-2 text-sm text-muted">
          You are signed in to {restaurant?.name || 'your restaurant'}. Table ordering will be enabled in a later phase.
        </p>
      </div>

      <Card title="Assigned tables">
        {tables.length === 0 ? (
          <EmptyState title="No tables assigned" body="Ask the restaurant owner to assign tables to your waiter ID." />
        ) : (
          <ul className="divide-y divide-line">
            {tables.map((table) => (
              <li key={table.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{tableHeading(table)}</p>
                  {table.capacity ? <p className="text-xs text-muted">Capacity {table.capacity}</p> : null}
                </div>
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  {table.is_active === false ? 'QR inactive' : 'Assigned'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
