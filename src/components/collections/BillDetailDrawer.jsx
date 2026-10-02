import { useEffect, useState } from 'react'
import Spinner from '../Spinner'
import { billStatusLabel, formatBillMoney, paymentMethodLabel } from '../../lib/orderCart'
import { formatReportDateTime } from '../../lib/reportDates'
import { sessionTableRowLabel } from '../../services/collections'
import { listSessionOrders } from '../../services/waiterOrders'

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-medium text-ink' : 'text-muted'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export default function BillDetailDrawer({ open, row, restaurant, onClose }) {
  const [orders, setOrders] = useState([])
  const [busy, setBusy] = useState(false)
  const sessionId = row?.session_id
  const restaurantId = restaurant?.id

  useEffect(() => {
    if (!open || !sessionId || !restaurantId) {
      setOrders([])
      return undefined
    }
    let active = true
    setBusy(true)
    listSessionOrders(restaurantId, sessionId).then((result) => {
      if (!active) return
      setOrders((result.data || []).filter((order) => order.status !== 'cancelled'))
      setBusy(false)
    })
    return () => {
      active = false
    }
  }, [open, sessionId, restaurantId])

  if (!open || !row) return null

  const payments = row.payments || []
  const remaining = Math.max(0, (Number(row.grand_total) || 0) - (Number(row.paid) || 0))

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close bill detail" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Settlement detail</p>
            <h2 className="mt-1 font-display text-2xl">{row.bill_number || 'Bill'}</h2>
            <p className="mt-0.5 text-sm text-muted">{restaurant?.name || 'Restaurant'} · {sessionTableRowLabel(row.tables)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm">
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Session</p>
              <p className="mt-1 font-medium">{row.session_number || 'Session'}</p>
              <p className="mt-0.5 text-xs text-muted">Started {formatReportDateTime(row.started_at)}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Waiter</p>
              <p className="mt-1 font-medium">{row.waiter_name || 'Unassigned'}</p>
              {row.waiter_code ? <p className="mt-0.5 text-xs text-muted">{row.waiter_code}</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Settled</p>
            <p className="mt-1 font-medium">{formatReportDateTime(row.settled_at)}</p>
            <p className="mt-0.5 text-xs text-muted">{billStatusLabel(row.status)}</p>
          </div>

          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Orders</p>
            {busy ? (
              <div className="py-4"><Spinner /></div>
            ) : orders.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {orders.map((order) => {
                  const items = order.order_items || []
                  const total = items.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0)
                  return (
                    <li key={order.id} className="flex items-baseline justify-between gap-3">
                      <span>
                        <span className="font-medium">Order #{order.order_number}</span>
                        <span className="block text-xs text-muted">
                          {formatReportDateTime(order.created_at)} · {items.length} {items.length === 1 ? 'item' : 'items'}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatBillMoney(total)}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No orders found</p>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Financials</p>
            <Row label="Subtotal" value={formatBillMoney(row.subtotal)} />
            <Row label="Discount" value={row.discount_amount ? `- ${formatBillMoney(row.discount_amount)}` : formatBillMoney(0)} />
            <Row label="Payable" value={formatBillMoney(row.grand_total)} strong />
          </div>

          <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Payment history</p>
            {payments.length ? (
              <ul className="mt-3 space-y-2">
                {payments.map((payment, index) => (
                  <li key={`${payment.method}-${index}`} className="flex items-start justify-between gap-3">
                    <span>
                      <span className="font-medium">{paymentMethodLabel(payment.method || payment.payment_method)}</span>
                      {payment.reference ? <span className="mt-0.5 block text-xs text-muted">{payment.reference}</span> : null}
                      <span className="mt-0.5 block text-xs text-muted">{formatReportDateTime(payment.paid_at)}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatBillMoney(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted">No payments recorded</p>
            )}
            <div className="mt-3 flex justify-between border-t border-line pt-3 font-medium">
              <span>Total paid</span>
              <span className="tabular-nums">{formatBillMoney(row.paid)}</span>
            </div>
            {remaining > 0 ? (
              <div className="mt-1 flex justify-between text-accent-dark">
                <span>Remaining</span>
                <span className="tabular-nums">{formatBillMoney(remaining)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  )
}
