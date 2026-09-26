import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import Spinner from '../../../components/Spinner'
import { firstRelated, formatClock, formatMoney, formatQty, isOpenSession, kotStatusLabel, kotTypeLabel, orderStatusLabel } from '../../../lib/orderCart'
import { printKot } from '../../../lib/kotPrint'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { tableHeading } from '../../../lib/tableToken'
import { listTables } from '../../../services/tables'
import { orderSubtotal, listRestaurantOrders } from '../../../services/waiterOrders'

const FILTERS = [
  { id: 'open', label: 'Open sessions' },
  { id: 'all', label: 'All orders' },
  { id: 'new', label: 'New' },
]

export default function LiveOrders() {
  const { restaurant, loading } = useOutletContext()
  const [orders, setOrders] = useState([])
  const [tables, setTables] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [filter, setFilter] = useState('open')

  async function load() {
    if (!restaurant?.id) {
      setOrders([])
      setTables([])
      setBusy(false)
      return
    }
    setBusy(true)
    const [nextOrders, nextTables] = await Promise.all([listRestaurantOrders(restaurant.id), listTables(restaurant.id)])
    setOrders(nextOrders.data ?? [])
    setTables(nextTables.data ?? [])
    setError(nextOrders.error?.message || nextTables.error?.message || '')
    setBusy(false)
  }

  useEffect(() => {
    load()
  }, [restaurant?.id])

  const tableById = useMemo(() => Object.fromEntries((tables || []).map((table) => [table.id, table])), [tables])

  function orderSession(order) {
    return firstRelated(order?.table_sessions)
  }

  function orderWaiter(order) {
    return firstRelated(order?.waiters)
  }

  const visible = useMemo(() => {
    return (orders || []).filter((order) => {
      if (filter === 'new') return order.status === 'new'
      if (filter === 'open') {
        const session = orderSession(order)
        return !session || isOpenSession(session)
      }
      return true
    })
  }, [orders, filter])

  if (loading || busy) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Live orders are scoped to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Live Orders</h1>
          <p className="mt-1 text-sm text-muted">{restaurant.name} · waiters send orders; kitchen status is updated on Kitchen / KOT.</p>
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <Alert>{error}</Alert>

      <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter orders">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
              filter === option.id ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="Orders appear here after a waiter opens a table and sends an order. Each order has one kitchen ticket."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((order) => {
            const items = order.order_items || []
            const session = orderSession(order)
            const table = tableById[order.source_table_id] || tableById[session?.primary_table_id]
            const waiter = orderWaiter(order)
            const waiterLabel = waiter?.waiter_id || 'Waiter'
            const kot = firstRelated(order.kots)
            return (
              <section key={order.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-xl">Order #{order.order_number}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {table ? tableHeading(table) : 'Table'} · {session?.session_number || 'Session'} · {waiterLabel}
                    </p>
                    <p className="text-xs text-muted">
                      {formatClock(order.created_at)}
                      {kot ? ` · KOT #${kot.kot_number} · ${kotTypeLabel(kot.kot_type)}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatMoney(orderSubtotal(items))}</p>
                    <p className="text-xs text-muted">{orderStatusLabel(order.status)}</p>
                    <p className="text-xs text-muted">{kot ? kotStatusLabel(kot.status) : 'No KOT'}</p>
                  </div>
                </div>
                {items.length ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span>
                          {formatQty(item.quantity)} × {item.item_name}
                        </span>
                        <span className="text-muted">{formatMoney(item.line_total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted">No line items</p>
                )}
                {order.notes ? <p className="mt-2 text-sm text-muted">Note: {order.notes}</p> : null}
                {kot ? (
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5"
                      onClick={() => printKot({ restaurant, kot, table, waiter, order })}
                    >
                      Print KOT
                    </Button>
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
