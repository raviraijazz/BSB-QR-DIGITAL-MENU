import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { applyBillDiscount, firstRelated, formatBillMoney, formatClock, formatQty, isOpenSession, kotStatusLabel, kotTypeLabel, orderStatusLabel, sessionOrderTotals } from '../../lib/orderCart'
import { tableHeading } from '../../lib/tableToken'
import { getSessionBill } from '../../services/bills'
import { getSession, tableForSession, waiterOwnsSession } from '../../services/tableSessions'
import { listSessionOrders, orderSubtotal } from '../../services/waiterOrders'

export default function WaiterSession() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { waiter, restaurant, tables } = useOutletContext()
  const [session, setSession] = useState(null)
  const [orders, setOrders] = useState([])
  const [bill, setBill] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.notice || '')
  const [loading, setLoading] = useState(true)

  const table = useMemo(() => tableForSession(tables, session), [tables, session])

  async function load(silent = false) {
    if (!restaurant?.id || !sessionId) return
    if (!silent) setLoading(true)
    const { data, error: sessionError } = await getSession(sessionId, restaurant.id)
    if (sessionError || !data || !waiterOwnsSession(tables, data)) {
      setSession(null)
      setOrders([])
      setBill(null)
      setError(sessionError?.message || 'Session not found or not assigned to you.')
      setLoading(false)
      return
    }
    const [{ data: nextOrders, error: orderError }, nextBill] = await Promise.all([
      listSessionOrders(restaurant.id, data.id),
      getSessionBill(restaurant.id, data.id),
    ])
    setSession(data)
    setOrders(nextOrders ?? [])
    setBill(nextBill.data || null)
    setError(orderError?.message || nextBill.error?.message || '')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [restaurant?.id, sessionId, tables])

  useEffect(() => {
    if (!restaurant?.id || !sessionId) return undefined
    const timer = window.setInterval(() => load(true), 8000)
    return () => window.clearInterval(timer)
  }, [restaurant?.id, sessionId, tables])

  useEffect(() => {
    if (location.state?.notice) {
      navigate('.', { replace: true, state: {} })
    }
  }, [])

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
  const totals = sessionOrderTotals(orders)
  const running = applyBillDiscount(totals.subtotal, bill?.discount_type, bill?.discount_value)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/waiter" className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            My Tables
          </Link>
          <h1 className="mt-1 font-display text-3xl">{table ? tableHeading(table) : 'Table'}</h1>
          <p className="mt-1 text-sm text-muted">
            {restaurant?.name || 'Restaurant'} · {waiter.full_name} · <span className="font-mono">{waiter.waiter_id}</span>
          </p>
          <p className="text-sm text-muted">
            {session.session_number} · {open ? 'Active session' : 'Closed'} · Started {formatClock(session.started_at)}
          </p>
        </div>
        {open ? (
          <Button onClick={() => navigate(`/waiter/sessions/${session.id}/order`)}>Add Order</Button>
        ) : (
          <p className="text-sm text-muted">This table session is no longer active.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Orders</p>
          <p className="mt-1 font-display text-2xl">{totals.orderCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Subtotal</p>
          <p className="mt-1 font-display text-2xl">{formatBillMoney(totals.subtotal)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Discount</p>
          <p className="mt-1 font-display text-2xl">{running.discountAmount ? formatBillMoney(running.discountAmount) : 'None'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Payable</p>
          <p className="mt-1 font-display text-2xl">{formatBillMoney(running.payable)}</p>
        </div>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      {orders.length === 0 ? (
        <EmptyState
          title="Waiting for first order"
          body="Add the first order for this table. Each Place Order creates a new order with only the items in the cart."
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
                      {formatClock(order.created_at)} · {waiter.full_name}
                    </p>
                    {kot ? (
                      <p className="mt-1 text-sm text-muted">
                        KOT #{kot.kot_number} · {kotTypeLabel(kot.kot_type)} · {kotStatusLabel(kot.status)}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">{orderStatusLabel(order.status)}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatMoney(orderSubtotal(items))}</p>
                    <p className="text-xs text-muted">{kot ? kotStatusLabel(kot.status) : orderStatusLabel(order.status)}</p>
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
