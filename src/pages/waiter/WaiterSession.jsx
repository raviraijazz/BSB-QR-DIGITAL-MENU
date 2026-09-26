import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { firstRelated, formatClock, formatMoney, formatQty, isOpenSession, kotStatusLabel, kotTypeLabel } from '../../lib/orderCart'
import { tableHeading } from '../../lib/tableToken'
import { getSession, tableForSession, waiterOwnsSession } from '../../services/tableSessions'
import { listSessionOrders, orderSubtotal } from '../../services/waiterOrders'

export default function WaiterSession() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { waiter, restaurant, tables } = useOutletContext()
  const [session, setSession] = useState(null)
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const table = useMemo(() => tableForSession(tables, session), [tables, session])

  async function load() {
    if (!restaurant?.id || !sessionId) return
    setLoading(true)
    const { data, error: sessionError } = await getSession(sessionId, restaurant.id)
    if (sessionError || !data || !waiterOwnsSession(tables, data)) {
      setSession(null)
      setOrders([])
      setError(sessionError?.message || 'Session not found or not assigned to you.')
      setLoading(false)
      return
    }
    const { data: nextOrders, error: orderError } = await listSessionOrders(restaurant.id, data.id)
    setSession(data)
    setOrders(nextOrders ?? [])
    setError(orderError?.message || '')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [restaurant?.id, sessionId, tables])

  if (loading) return <Spinner />
  if (!session) {
    return (
      <EmptyState
        title="Session not available"
        body={error || 'Open one of your assigned tables first.'}
        actionTo="/waiter"
        actionLabel="My Tables"
      />
    )
  }

  const open = isOpenSession(session)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/waiter" className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            My Tables
          </Link>
          <h1 className="mt-1 font-display text-3xl">{table ? tableHeading(table) : 'Table'}</h1>
          <p className="mt-1 text-sm text-muted">
            {session.session_number} · {formatClock(session.started_at)} · {waiter.waiter_id}
          </p>
        </div>
        {open ? (
          <Button onClick={() => navigate(`/waiter/sessions/${session.id}/order`)}>Add Order</Button>
        ) : (
          <p className="text-sm text-muted">This session is no longer open for orders.</p>
        )}
      </div>

      <Alert>{error}</Alert>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="Create the first order for this table. Each send creates a new order and one kitchen ticket."
          actionLabel={open ? 'Add Order' : undefined}
          onAction={open ? () => navigate(`/waiter/sessions/${session.id}/order`) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const items = order.order_items || []
            const kot = firstRelated(order.kots)
            return (
              <section key={order.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl">Order #{order.order_number}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {kot ? `KOT #${kot.kot_number} · ${kotTypeLabel(kot.kot_type)}` : 'Kitchen ticket pending'}
                    </p>
                    <p className="text-xs text-muted">
                      {formatClock(order.created_at)} · {waiter.waiter_id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatMoney(orderSubtotal(items))}</p>
                    <p className="text-xs text-muted">{kot ? kotStatusLabel(kot.status) : 'Not sent to kitchen'}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>
                        {formatQty(item.quantity)} × {item.item_name}
                        {item.notes ? <span className="block text-xs text-muted">{item.notes}</span> : null}
                      </span>
                      <span className="text-muted">{formatMoney(item.line_total)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
