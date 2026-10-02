import { billStatusLabel, formatBillMoney } from '../../lib/orderCart'
import { formatReportTime } from '../../lib/reportDates'
import { sessionTableRowLabel } from '../../services/collections'

export default function OutstandingBills({ rows }) {
  const list = rows || []
  if (!list.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-8 text-center text-sm text-muted">
        No outstanding bills
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-card md:block">
        <div className="grid grid-cols-[1.3fr_1.2fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr] gap-2 border-b border-line bg-paper px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          <span>Table(s)</span>
          <span>Session</span>
          <span>Waiter</span>
          <span className="text-right">Payable</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Remaining</span>
          <span className="text-right">Started</span>
        </div>
        {list.map((row) => (
          <div
            key={row.bill_id}
            className="grid grid-cols-[1.3fr_1.2fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr] items-center gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0"
          >
            <span className="min-w-0 truncate font-medium">{sessionTableRowLabel(row.tables)}</span>
            <span className="min-w-0">
              <span className="block truncate">{row.session_number || 'Session'}</span>
              <span className="block text-[11px] text-muted">{billStatusLabel(row.status)}</span>
            </span>
            <span className="min-w-0 truncate text-muted">{row.waiter_name || row.waiter_code || '—'}</span>
            <span className="text-right tabular-nums">{formatBillMoney(row.grand_total)}</span>
            <span className="text-right tabular-nums">{formatBillMoney(row.paid)}</span>
            <span className="text-right font-medium tabular-nums text-accent-dark">{formatBillMoney(row.remaining)}</span>
            <span className="text-right text-xs text-muted">{formatReportTime(row.started_at)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3 md:hidden">
        {list.map((row) => (
          <div key={row.bill_id} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg">{sessionTableRowLabel(row.tables)}</p>
                <p className="text-xs text-muted">{row.session_number || 'Session'} · {row.waiter_name || row.waiter_code || 'Waiter'}</p>
              </div>
              <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[11px] font-medium text-accent-dark">
                {billStatusLabel(row.status)}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted">Paid {formatBillMoney(row.paid)} / {formatBillMoney(row.grand_total)}</span>
              <span className="font-medium text-accent-dark">Due {formatBillMoney(row.remaining)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
