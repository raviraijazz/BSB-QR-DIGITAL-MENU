import { useEffect, useState } from 'react'
import {
  billSnapshotRows,
  formatHistoryClock,
  formatHistoryDate,
  formatHistoryDateTime,
  historyStatusLabel,
  historyTimeline,
  historyWaiterName,
  itemVariant,
  paymentStateLabel,
  sessionStatusLabel,
  statusTone,
} from '../../lib/orderHistory'
import { formatBillMoney, formatQty, kotStatusLabel, kotTypeLabel, paymentMethodLabel } from '../../lib/orderCart'
import { tableHeading, uniqueTables } from '../../lib/tableToken'
import { downloadBillPdfFile, printSettledBill } from '../../services/printJobs'
import NavIcon from '../NavIcon'

const TABS = [
  { id: 'order', label: 'Order Details' },
  { id: 'kots', label: 'KOTs' },
  { id: 'bill', label: 'Bill & Payment' },
  { id: 'timeline', label: 'Timeline' },
]

function hashNum(value) {
  const text = String(value || '').replace(/^#/, '')
  return text ? `#${text}` : '—'
}

function Badge({ status, label }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(status)}`}>{label}</span>
}

function Row({ label, value, strong = false, danger = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${strong ? 'font-semibold text-ink' : ''} ${danger ? 'font-medium text-rose-600' : ''}`}>
      <span className={danger ? 'text-rose-600' : strong ? 'text-ink' : 'text-muted'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function Card({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-[16px] border border-line bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function OrderItems({ row }) {
  const items = row.order.order_items || []
  return (
    <Card title="Order Items" action={<span className="text-[12px] text-muted">{formatQty(row.itemCount)} items</span>}>
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium">Variant</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Unit Price</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="py-2 font-medium">{item.item_name}</td>
                  <td className="py-2 text-muted">{itemVariant(item) || '—'}</td>
                  <td className="py-2 tabular-nums">{formatQty(item.quantity)}</td>
                  <td className="py-2 text-right tabular-nums">{formatBillMoney(item.unit_price)}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{formatBillMoney(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">No items</p>
      )}
      <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-semibold">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatBillMoney(row.subtotal)}</span>
      </div>
    </Card>
  )
}

function KotCard({ kot, restaurant }) {
  return (
    <article className="rounded-[14px] border border-line bg-paper/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">KOT {hashNum(kot.kot_number)}</p>
          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
            {kotTypeLabel(kot.kot_type)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">Created: {formatHistoryClock(kot.created_at, restaurant)}</span>
          <Badge status={kot.status} label={kotStatusLabel(kot.status)} />
        </div>
      </div>
      {(kot.kot_items || []).length ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="pb-1 font-medium">Item</th>
              <th className="pb-1 text-right font-medium">Qty</th>
              <th className="pb-1 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(kot.kot_items || []).map((item) => (
              <tr key={item.id} className="border-t border-line/80">
                <td className="py-1.5">
                  {item.item_name}
                  {item.notes ? <span className="mt-0.5 block text-[11px] text-muted">{item.notes}</span> : null}
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatQty(item.quantity)}</td>
                <td className="py-1.5 text-right">
                  <Badge status={kot.status} label={kotStatusLabel(kot.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-sm text-muted">No kitchen items</p>
      )}
    </article>
  )
}

function SessionCard({ row, restaurant }) {
  const tables = uniqueTables(row.sessionTables?.length ? row.sessionTables : row.sourceTable ? [row.sourceTable] : [])
  return (
    <Card
      title="Session Information"
      action={row.session ? <Badge status={row.session.status === 'closed' ? 'completed' : 'open'} label={sessionStatusLabel(row.session.status)} /> : null}
    >
      <p className="mb-3 font-medium">Session {hashNum(row.session?.session_number)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-[11px] text-muted">Started</p>
            <p>{formatHistoryDateTime(row.session?.started_at, restaurant)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Closed</p>
            <p>{row.session?.closed_at ? formatHistoryDateTime(row.session.closed_at, restaurant) : 'Open'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Waiter</p>
            <p>{historyWaiterName(row.waiter)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Order Type</p>
            <p>{row.orderType}</p>
          </div>
        </div>
        <div className="rounded-xl bg-sky-50 px-3 py-3 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-sky-800">Tables in Session</p>
          <ul className="mt-2 space-y-1 font-medium text-ink">
            {tables.length ? tables.map((table) => <li key={table.id}>{tableHeading(table)}</li>) : <li>{row.tableLabel}</li>}
          </ul>
        </div>
      </div>
    </Card>
  )
}

function SummaryCards({ row, snapshot, restaurant }) {
  return (
    <div className="space-y-3">
      <Card title="Order Summary">
        <div className="space-y-1.5">
          <Row label={`Subtotal (${formatQty(row.itemCount)} items)`} value={formatBillMoney(snapshot.subtotal || row.subtotal)} />
          <Row label="Discount" value={snapshot.discount ? `− ${formatBillMoney(snapshot.discount)}` : formatBillMoney(0)} />
          <Row label="Taxable Value" value={formatBillMoney(snapshot.taxable || row.subtotal)} />
          <Row label={snapshot.taxLabel || 'Tax'} value={formatBillMoney(snapshot.tax)} />
          <Row label="Service Charge" value={formatBillMoney(snapshot.service)} />
          <div className="border-t border-line pt-2">
            <Row label="Grand Total" value={formatBillMoney(snapshot.payable || row.subtotal)} strong />
          </div>
        </div>
      </Card>
      <Card title="Payment Information" action={<Badge status={row.paymentState} label={paymentStateLabel(row.paymentState)} />}>
        <div className="space-y-1.5">
          <Row label="Paid Amount" value={formatBillMoney(snapshot.paid)} />
          <Row label="Remaining" value={formatBillMoney(snapshot.remaining || (row.bill ? row.remaining : row.subtotal))} danger={(snapshot.remaining || 0) > 0} />
        </div>
      </Card>
      <Card title={`Payment History (${row.payments.length})`}>
        {row.payments.length ? (
          <ul className="space-y-2 text-sm">
            {row.payments.map((payment) => (
              <li key={payment.id} className="flex items-start justify-between gap-3">
                <span>
                  <span className="font-medium">{paymentMethodLabel(payment.payment_method)}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {formatHistoryDateTime(payment.paid_at || payment.created_at, restaurant)}
                    {payment.payment_reference ? ` · ${payment.payment_reference}` : ''}
                  </span>
                </span>
                <span className="tabular-nums">{formatBillMoney(payment.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No payments yet</p>
        )}
        <div className="mt-3 flex justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <span>Total Paid</span>
          <span className="tabular-nums">{formatBillMoney(snapshot.paid)}</span>
        </div>
      </Card>
      <Card title="Order Notes">
        <p className="text-sm text-muted">{row.order.notes || 'No notes for this order'}</p>
      </Card>
    </div>
  )
}

export default function OrderHistoryDrawer({ row, restaurant, onClose, mobile = false }) {
  const [tab, setTab] = useState('order')
  const [printBusy, setPrintBusy] = useState(false)
  const [printNotice, setPrintNotice] = useState('')
  const [printError, setPrintError] = useState('')

  useEffect(() => {
    setTab('order')
    setPrintNotice('')
    setPrintError('')
    function onKey(event) {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [row?.order?.id, onClose])

  if (!row) return null

  const snapshot = billSnapshotRows(row.bill, row.payments)
  const tables = uniqueTables(row.sessionTables?.length ? row.sessionTables : row.sourceTable ? [row.sourceTable] : [])
  const tableLine = tables.length
    ? tables.map((table) => tableHeading(table)).join(' • ')
    : row.tableHeadingLabel || row.tableLabel
  const timeline = historyTimeline(row)
  const kotLabel = `KOTs (${row.kots.length})`

  return (
    <aside className={`flex h-full min-h-0 flex-col overflow-hidden border-line bg-card ${mobile ? 'h-full' : 'rounded-[18px] border shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl leading-none">Order {hashNum(row.order.order_number)}</h2>
            <Badge status={row.status} label={historyStatusLabel(row.status)} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {formatHistoryDate(row.order.created_at, restaurant)} · {formatHistoryClock(row.order.created_at, restaurant)} · {tableLine}
          </p>
          <p className="mt-1 text-sm text-muted">
            {restaurant?.name || 'Restaurant'} · Session {hashNum(row.session?.session_number)} · Waiter: {historyWaiterName(row.waiter)} · {row.orderType}
          </p>
        </div>
        <button type="button" aria-label="Close order detail" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper" onClick={onClose}>
          <NavIcon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-medium"
          onClick={() => setTab('bill')}
        >
          View Bill
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-medium"
          onClick={() => setTab('order')}
        >
          View Session
        </button>
        {printError ? <p className="w-full text-[12px] text-rose-700">{printError}</p> : null}
        {printNotice ? <p className="w-full text-[12px] text-forest">{printNotice}</p> : null}
        {row.bill ? (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
              disabled={printBusy}
              onClick={async () => {
                setPrintBusy(true)
                setPrintError('')
                const result = await printSettledBill({
                  restaurant,
                  bill: row.bill,
                  orders: [row.order],
                  payments: row.payments,
                  table: row.sourceTable,
                  tableLabel: tableLine,
                  waiter: row.waiter,
                  reprint: true,
                })
                setPrintBusy(false)
                if (result.error) setPrintError(result.error.message)
                else setPrintNotice(result.printed ? 'Reprint dialog opened. Totals are shown as stored.' : 'Bill already printed.')
              }}
            >
              {printBusy ? 'Opening...' : 'Reprint'}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-medium"
              onClick={async () => {
                setPrintError('')
                const result = await downloadBillPdfFile({
                  restaurant,
                  bill: row.bill,
                  orders: [row.order],
                  payments: row.payments,
                  table: row.sourceTable,
                  tableLabel: tableLine,
                  waiter: row.waiter,
                  reprint: true,
                })
                if (result.error) setPrintError(result.error.message)
                else setPrintNotice('PDF downloaded from stored bill totals.')
              }}
            >
              PDF
            </button>
          </>
        ) : null}
      </div>

      <div className="flex gap-4 overflow-x-auto border-b border-line px-5">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTab(option.id)}
            className={`whitespace-nowrap py-3 text-[13px] font-medium ${
              tab === option.id ? 'border-b-2 border-forest text-forest' : 'text-muted'
            }`}
          >
            {option.id === 'kots' ? kotLabel : option.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {tab === 'order' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
            <div className="space-y-4">
              <OrderItems row={row} />
              {row.kots[0] ? (
                <Card title="KOT Information">
                  <KotCard kot={row.kots[0]} restaurant={restaurant} />
                </Card>
              ) : (
                <Card title="KOT Information">
                  <p className="text-sm text-muted">No kitchen tickets</p>
                </Card>
              )}
              <SessionCard row={row} restaurant={restaurant} />
            </div>
            <SummaryCards row={row} snapshot={snapshot} restaurant={restaurant} />
          </div>
        ) : null}

        {tab === 'kots' ? (
          row.kots.length ? (
            <div className="space-y-3">
              {row.kots.map((kot) => (
                <KotCard key={kot.id} kot={kot} restaurant={restaurant} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No kitchen tickets</p>
          )
        ) : null}

        {tab === 'bill' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Bill Summary">
              {row.bill ? (
                <div className="space-y-1.5">
                  <p className="mb-2 text-sm font-medium">{row.bill.bill_number ? `Bill ${hashNum(row.bill.bill_number)}` : 'Bill'}</p>
                  <Row label="Subtotal" value={formatBillMoney(snapshot.subtotal)} />
                  <Row label="Discount" value={snapshot.discount ? `− ${formatBillMoney(snapshot.discount)}` : 'None'} />
                  <Row label="Taxable Value" value={formatBillMoney(snapshot.taxable)} />
                  <Row label={snapshot.taxLabel || 'Tax'} value={snapshot.tax ? formatBillMoney(snapshot.tax) : 'None'} />
                  <Row label="Service Charge" value={snapshot.service ? formatBillMoney(snapshot.service) : 'None'} />
                  <div className="border-t border-line pt-2">
                    <Row label="Grand Total" value={formatBillMoney(snapshot.payable)} strong />
                  </div>
                  <p className="pt-2 text-[11px] text-muted">Historical bill totals are shown as stored. They are not recalculated.</p>
                </div>
              ) : (
                <p className="text-sm text-muted">No bill yet</p>
              )}
            </Card>
            <div className="space-y-4">
              <Card title="Payment Information" action={<Badge status={row.paymentState} label={paymentStateLabel(row.paymentState)} />}>
                <div className="space-y-1.5">
                  <Row label="Paid Amount" value={formatBillMoney(snapshot.paid)} />
                  <Row label="Remaining" value={formatBillMoney(row.bill ? snapshot.remaining : row.subtotal)} danger={(row.bill ? snapshot.remaining : row.subtotal) > 0} />
                  <Row label="Bill Status" value={row.bill ? paymentStateLabel(row.paymentState) : 'Unpaid'} />
                </div>
              </Card>
              <Card title="Payment History">
                {row.payments.length ? (
                  <ul className="space-y-2 text-sm">
                    {row.payments.map((payment) => (
                      <li key={payment.id} className="flex justify-between gap-3">
                        <span>
                          <span className="font-medium">{paymentMethodLabel(payment.payment_method)}</span>
                          <span className="mt-0.5 block text-[11px] text-muted">{formatHistoryDateTime(payment.paid_at || payment.created_at, restaurant)}</span>
                          {payment.payment_reference ? <span className="block text-[11px] text-muted">{payment.payment_reference}</span> : null}
                        </span>
                        <span className="tabular-nums">{formatBillMoney(payment.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No payments yet</p>
                )}
                <div className="mt-3 flex justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                  <span>Total Paid</span>
                  <span className="tabular-nums">{formatBillMoney(snapshot.paid)}</span>
                </div>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === 'timeline' ? (
          timeline.length ? (
            <ol className="space-y-3">
              {timeline.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="w-[4.5rem] shrink-0 pt-0.5 text-xs tabular-nums text-muted">{formatHistoryClock(event.at, restaurant)}</span>
                  <span className="min-w-0 border-l border-line pl-3">
                    <span className="block font-medium">{event.title}</span>
                    {event.detail ? <span className="block text-xs text-muted">{event.detail}</span> : null}
                    <span className="block text-xs text-muted">{formatHistoryDate(event.at, restaurant)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">No recorded events for this order.</p>
          )
        ) : null}
      </div>
    </aside>
  )
}
