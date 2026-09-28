import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { formatClock, formatMoney } from '../../lib/orderCart'
import { tableHeading } from '../../lib/tableToken'
import { listOpenSessions, openTableSession, sessionForTable } from '../../services/tableSessions'
import { listRestaurantOrders, orderSubtotal } from '../../services/waiterOrders'

export default function WaiterHome() {
  const { waiter, restaurant, tables } = useOutletContext()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!restaurant?.id) {
      setSessions([])
      setOrders([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [nextSessions, nextOrders] = await Promise.all([
      listOpenSessions(restaurant.id),
      listRestaurantOrders(restaurant.id),
    ])
    setLoading(false)
    setSessions(nextSessions.data ?? [])
    setOrders(nextOrders.data ?? [])
    setError(nextSessions.error?.message || nextOrders.error?.message || '')
  }

  useEffect(() => {
    load()
  }, [restaurant?.id])

  const totalsBySession = useMemo(() => {
    const map = new Map()
    for (const order of orders || []) {
      if (!order?.session_id || order.status === 'cancelled') continue
      const prev = map.get(order.session_id) || { amount: 0, orders: 0 }
      prev.amount += orderSubtotal(order.order_items || [])
      prev.orders += 1
      map.set(order.session_id, prev)
    }
    return map
  }, [orders])

  const cards = useMemo(
    () =>
      (tables || [])
        .filter((table) => table.is_active !== false)
        .map((table) => {
          const session = sessionForTable(sessions, table.id)
          return {
            table,
            session,
            totals: session ? totalsBySession.get(session.id) : null,
          }
        }),
    [tables, sessions, totalsBySession],
  )

  async function onOpen(table, session) {
    if (session) {
      navigate(`/waiter/sessions/${session.id}`)
      return
    }
    setBusyId(table.id)
    setError('')
    const { data, error: nextError } = await openTableSession(restaurant.id, table)
    setBusyId('')
    if (nextError || !data) {
      setError(nextError?.message || 'Unable to start this table session. Please try again.')
      return
    }
    navigate(`/waiter/sessions/${data.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Waiter</p>
          <h1 className="mt-1 font-display text-3xl">My Tables</h1>
          <p className="mt-1 text-sm text-muted">
            {waiter?.full_name} · <span className="font-mono">{waiter?.waiter_id}</span>
            {restaurant?.name ? ` · ${restaurant.name}` : ''}
          </p>
          <p className="mt-1 text-sm text-muted">Only tables assigned to you.</p>
        </div>
        <Link to="/waiter/account" className="text-sm text-muted hover:text-ink">
          Account / Change Password
        </Link>
      </div>

      <Alert>{error}</Alert>

      {loading ? (
        <Spinner />
      ) : cards.length === 0 ? (
        <EmptyState title="No tables assigned" body="Ask the restaurant owner to assign tables to your waiter ID." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ table, session, totals }) => {
            const active = Boolean(session)
            const billing = session?.status === 'bill_requested' || session?.status === 'payment_pending'
            return (
              <div key={table.id} className="flex min-h-[196px] flex-col rounded-[1.6rem] border border-line bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-xl leading-tight">{tableHeading(table)}</p>
                    {table.name && table.name !== table.table_number ? (
                      <p className="mt-0.5 truncate text-sm text-muted">{table.name}</p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      billing ? 'bg-gold/20 text-accent-dark' : active ? 'bg-forest/10 text-forest' : 'bg-paper text-muted'
                    }`}
                  >
                    {billing ? 'BILLING' : active ? 'OCCUPIED' : 'AVAILABLE'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{table.capacity ? `${table.capacity} seats` : 'Capacity not set'}</p>
                {active ? (
                  <div className="mt-2 rounded-xl border border-line bg-paper/70 px-3 py-2">
                    <p className="text-xs text-muted">
                      {session.session_number} · {formatClock(session.started_at)}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <p className="font-display text-lg leading-none">{totals?.amount ? formatMoney(totals.amount) : '—'}</p>
                      <p className="text-[11px] text-muted">
                        {totals?.orders ? `${totals.orders} ${totals.orders === 1 ? 'order' : 'orders'}` : 'No orders yet'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">No open session</p>
                )}
                <div className="mt-auto pt-4">
                  <Button className="w-full" disabled={busyId === table.id} onClick={() => onOpen(table, session)}>
                    {busyId === table.id ? 'Opening...' : active ? 'Open Table' : 'Start Session'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
