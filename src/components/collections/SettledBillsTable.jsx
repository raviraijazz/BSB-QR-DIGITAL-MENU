import Button from '../Button'
import { billStatusLabel, formatBillMoney, paymentMethodLabel } from '../../lib/orderCart'
import { formatReportDateTime } from '../../lib/reportDates'
import { billMethodsSummary, sessionTableRowLabel } from '../../services/collections'

function statusPill(status) {
  if (status === 'paid') return 'bg-forest/10 text-forest'
  if (status === 'payment_pending') return 'bg-gold/20 text-accent-dark'
  return 'bg-paper text-muted'
}

function MethodsSummary({ payments }) {
  const rows = billMethodsSummary(payments)
  if (!rows.length) return <span className="text-muted">—</span>
  return (
    <span className="space-y-0.5">
      {rows.map((row) => (
        <span key={row.method} className="block text-[11px] text-muted">
          {paymentMethodLabel(row.method)} {formatBillMoney(row.amount)}
        </span>
      ))}
    </span>
  )
}

export default function SettledBillsTable({ rows, total, offset, limit, onPrev, onNext, onSelect, busy, emptyLabel }) {
  const list = rows || []
  const start = list.length ? offset + 1 : 0
  const end = offset + list.length

  if (!total) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-10 text-center text-sm text-muted">
        {emptyLabel || 'No collections found for this period'}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-card md:block">
        <div className="grid grid-cols-[8.5rem_1.1fr_1.2fr_1fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr_5.5rem] gap-2 border-b border-line bg-paper px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          <span>Settled</span>
          <span>Bill / Session</span>
          <span>Table(s)</span>
          <span>Waiter</span>
          <span className="text-right">Gross</span>
          <span className="text-right">Discount</span>
          <span className="text-right">Payable</span>
          <span className="text-right">Paid</span>
          <span>Methods</span>
          <span />
        </div>
        {list.map((row) => (
          <button
            key={row.bill_id}
            type="button"
            onClick={() => onSelect(row)}
            className="grid w-full grid-cols-[8.5rem_1.1fr_1.2fr_1fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr_5.5rem] items-center gap-2 border-b border-line px-4 py-3 text-left text-sm last:border-b-0 hover:bg-forest/5"
          >
            <span className="text-xs text-muted">{formatReportDateTime(row.settled_at)}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{row.bill_number || 'Bill'}</span>
              <span className="block truncate text-[11px] text-muted">{row.session_number || 'Session'}</span>
            </span>
            <span className="min-w-0 truncate">{sessionTableRowLabel(row.tables)}</span>
            <span className="min-w-0 truncate text-muted">{row.waiter_name || row.waiter_code || '—'}</span>
            <span className="text-right tabular-nums">{formatBillMoney(row.subtotal)}</span>
            <span className="text-right tabular-nums">{row.discount_amount ? formatBillMoney(row.discount_amount) : '—'}</span>
            <span className="text-right tabular-nums">{formatBillMoney(row.grand_total)}</span>
            <span className="text-right font-medium tabular-nums">{formatBillMoney(row.paid)}</span>
            <MethodsSummary payments={row.payments} />
            <span className="flex justify-end">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusPill(row.status)}`}>
                {billStatusLabel(row.status)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3 md:hidden">
        {list.map((row) => (
          <button
            key={row.bill_id}
            type="button"
            onClick={() => onSelect(row)}
            className="w-full rounded-2xl border border-line bg-card p-4 text-left shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-xl">{row.bill_number || 'Bill'}</p>
                <p className="mt-0.5 text-sm text-muted">{sessionTableRowLabel(row.tables)}</p>
                <p className="text-xs text-muted">{row.session_number || 'Session'} · {formatReportDateTime(row.settled_at)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusPill(row.status)}`}>
                {billStatusLabel(row.status)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">{row.waiter_name || row.waiter_code || 'Waiter not assigned'}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="text-xs text-muted">
                <MethodsSummary payments={row.payments} />
              </div>
              <p className="text-right">
                <span className="block font-display text-lg leading-none tabular-nums">{formatBillMoney(row.paid)}</span>
                <span className="block text-[11px] text-muted">of {formatBillMoney(row.grand_total)}</span>
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          Showing {start}–{end} of {total} settlements
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" disabled={busy || offset <= 0} onClick={onPrev}>
            Previous
          </Button>
          <Button
            variant="secondary"
            className="h-9 px-3 py-0 text-[13px]"
            disabled={busy || end >= total}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
