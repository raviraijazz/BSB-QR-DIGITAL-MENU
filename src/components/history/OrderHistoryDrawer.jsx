import { useEffect, useState } from 'react'
import Alert from '../Alert'
import Button from '../Button'
import {
  billSnapshotRows,
  historyStatusLabel,
  historyTimeline,
  itemVariant,
  paymentStateLabel,
  statusTone,
} from '../../lib/orderHistory'
import {
  billStatusLabel,
  formatBillMoney,
  formatClock,
  formatQty,
  kotStatusLabel,
  kotTypeLabel,
  orderStatusLabel,
  paymentMethodLabel,
} from '../../lib/orderCart'
import { formatReportDate, formatReportDateTime } from '../../lib/reportDates'
import { sessionTablesLabel, tableHeading } from '../../lib/tableToken'
import { waiterLabel } from '../../services/bills'

const TABS = [
  { id: 'order', label: 'Order' },
  { id: 'timeline', label: 'Timeline' },
]

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${strong ? 'font-medium text-ink' : ''}`}>
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function Badge({ status, label }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(status)}`}>{label}</span>
}

export default function OrderHistoryDrawer({ open, row, restaurant, onClose }) {
  const [tab, setTab] = useState('order')

  useEffect(() => {
    setTab('order')
    function onKey(event) {
      if (event.key === 'Escape') onClose?.()
    }
    if (!open) return undefined
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, row?.order?.id, onClose])

  if (!open || !row) return null

  const snapshot = billSnapshotRows(row.bill, row.payments)
  const waiter = waiterLabel(row.waiter)
  const tables = row.sessionTables?.length
    ? sessionTablesLabel(row.sessionTables, { compact: true })
    : row.sourceTable
      ? tableHeading(row.sourceTable)
      : row.tableLabel
  const timeline = historyTimeline(row)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close order detail" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-line bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Order history</p>
            <h2 className="mt-1 font-display text-2xl">Order #{row.order.order_number}</h2>
            <p className="mt-1 text-sm text-muted">
              {restaurant?.name || 'Restaurant'} · {formatReportDateTime(row.order.created_at)}
            </p>
          </div>
          <Button variant="secondary" className="shrink-0" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex gap-1 border-b border-line px-5 py-2">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTab(option.id)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                tab === option.id ? 'bg-forest text-[#f5ead8]' : 'border border-line bg-white text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {tab === 'timeline' ? (
            timeline.length ? (
              <ol className="space-y-3">
                {timeline.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-muted">{formatClock(event.at)}</span>
                    <span className="min-w-0 border-l border-line pl-3">
                      <span className="block font-medium">{event.title}</span>
                      {event.detail ? <span className="block text-xs text-muted">{event.detail}</span> : null}
                      <span className="block text-xs text-muted">{formatReportDate(event.at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">No recorded events for this order.</p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge status={row.status} label={historyStatusLabel(row.status)} />
                <Badge status={row.order.status} label={orderStatusLabel(row.order.status)} />
                {row.order.status === 'cancelled' ? <Badge status="cancelled" label="Cancelled" /> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-line bg-paper/70 px-4 py-3 text-sm">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Table</p>
                  <p className="mt-1 font-medium">{tables}</p>
                  <p className="mt-0.5 text-xs text-muted">{row.orderType}</p>
                </div>
                <div className="rounded-2xl border border-line bg-paper/70 px-4 py-3 text-sm">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Waiter</p>
                  <p className="mt-1 font-medium">{waiter}</p>
                </div>
              </div>

              <section className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Session</p>
                <div className="mt-2 space-y-1.5">
                  <Row label="Session" value={row.session?.session_number || '—'} />
                  <Row label="Started" value={formatReportDateTime(row.session?.started_at)} />
                  <Row label="Ended" value={row.session?.closed_at ? formatReportDateTime(row.session.closed_at) : 'Open'} />
                  <Row label="Tables" value={tables} />
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Order items</p>
                {(row.order.order_items || []).length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {(row.order.order_items || []).map((item) => (
                      <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-line pb-2 last:border-b-0 last:pb-0">
                        <span>
                          <span className="font-medium">{item.item_name}</span>
                          {itemVariant(item) ? <span className="mt-0.5 block text-xs text-muted">{itemVariant(item)}</span> : null}
                          {item.notes ? <span className="mt-0.5 block text-xs text-muted">{item.notes}</span> : null}
                          <span className="mt-0.5 block text-xs text-muted">
                            {formatQty(item.quantity)} × {formatBillMoney(item.unit_price)}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatBillMoney(item.line_total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">No items</p>
                )}
                <div className="mt-3 flex justify-between text-sm font-medium">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatBillMoney(row.subtotal)}</span>
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">KOT</p>
                {row.kots.length ? (
                  <div className="mt-3 space-y-3">
                    {row.kots.map((kot) => (
                      <article key={kot.id} className="rounded-xl border border-line bg-paper/60 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">KOT #{kot.kot_number}</p>
                            <p className="text-xs text-muted">
                              {kotTypeLabel(kot.kot_type)} · {formatReportDateTime(kot.created_at)}
                            </p>
                          </div>
                          <Badge status={kot.status} label={kotStatusLabel(kot.status)} />
                        </div>
                        <ul className="mt-2 space-y-1 text-sm">
                          {(kot.kot_items || []).map((item) => (
                            <li key={item.id} className="flex justify-between gap-3">
                              <span>{item.item_name}</span>
                              <span className="tabular-nums text-muted">×{formatQty(item.quantity)}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">No kitchen tickets</p>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Bill</p>
                {row.bill ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium">{row.bill.bill_number || 'Bill'}</p>
                      <Badge status={row.bill.status} label={billStatusLabel(row.bill.status)} />
                    </div>
                    <Row label="Subtotal" value={formatBillMoney(snapshot.subtotal)} />
                    <Row label="Discount" value={snapshot.discount ? `-${formatBillMoney(snapshot.discount)}` : 'None'} />
                    <Row label="Taxable Value" value={formatBillMoney(snapshot.taxable)} />
                    <Row label="Tax" value={snapshot.tax ? formatBillMoney(snapshot.tax) : 'None'} />
                    <Row label="Service Charge" value={snapshot.service ? formatBillMoney(snapshot.service) : 'None'} />
                    <Row label="Grand Total" value={formatBillMoney(snapshot.payable)} strong />
                    <Row label="Paid" value={formatBillMoney(snapshot.paid)} />
                    <Row label="Remaining" value={formatBillMoney(snapshot.remaining)} />
                    <Alert type="info">Historical bill totals are shown as stored. They are not recalculated.</Alert>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">No bill yet</p>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Payments</p>
                {row.payments.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {row.payments.map((payment) => (
                      <li key={payment.id} className="flex justify-between gap-3">
                        <span>
                          <span className="font-medium">{paymentMethodLabel(payment.payment_method)}</span>
                          <span className="mt-0.5 block text-xs text-muted">{formatReportDateTime(payment.paid_at || payment.created_at)}</span>
                          {payment.payment_reference ? <span className="block text-xs text-muted">{payment.payment_reference}</span> : null}
                        </span>
                        <span className="tabular-nums">{formatBillMoney(payment.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">No payments yet</p>
                )}
                <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-medium">
                  <span>{paymentStateLabel(row.paymentState)}</span>
                  <span className="tabular-nums">{formatBillMoney(row.paid)}</span>
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
