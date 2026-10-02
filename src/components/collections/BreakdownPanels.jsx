import { formatBillMoney, paymentMethodLabel } from '../../lib/orderCart'
import { sessionTableRowLabel } from '../../services/collections'

export function MethodBreakdown({ methods, total }) {
  const rows = methods || []
  const base = Number(total) || 0
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const amount = Number(row.amount) || 0
        const share = base > 0 ? Math.round((amount / base) * 1000) / 10 : 0
        return (
          <div key={row.method}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{paymentMethodLabel(row.method)}</span>
              <span className="tabular-nums">{formatBillMoney(amount)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-forest/70" style={{ width: `${Math.min(share, 100)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{row.count || 0} {row.count === 1 ? 'payment' : 'payments'}</span>
              <span>{share}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyRow({ children }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>
}

export function WaiterBreakdown({ rows }) {
  const list = (rows || []).filter(Boolean)
  if (!list.length) return <EmptyRow>No waiter collections for this period</EmptyRow>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-muted">
            <th className="py-2 pr-3 font-medium">Waiter</th>
            <th className="py-2 pr-3 text-right font-medium">Bills</th>
            <th className="py-2 pr-3 text-right font-medium">Gross</th>
            <th className="py-2 pr-3 text-right font-medium">Discount</th>
            <th className="py-2 text-right font-medium">Collected</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row, index) => (
            <tr key={row.waiter_id || `none-${index}`} className="border-b border-line last:border-b-0">
              <td className="py-2.5 pr-3">
                <span className="font-medium">{row.name || row.waiter_code || 'Unassigned'}</span>
                {row.waiter_code && row.name ? <span className="block text-[11px] text-muted">{row.waiter_code}</span> : null}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{row.bills || 0}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatBillMoney(row.gross)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatBillMoney(row.discount)}</td>
              <td className="py-2.5 text-right font-medium tabular-nums">{formatBillMoney(row.collected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TableBreakdown({ rows }) {
  const list = (rows || []).filter(Boolean)
  if (!list.length) return <EmptyRow>No table collections for this period</EmptyRow>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-muted">
            <th className="py-2 pr-3 font-medium">Table</th>
            <th className="py-2 pr-3 text-right font-medium">Bills</th>
            <th className="py-2 pr-3 text-right font-medium">Gross</th>
            <th className="py-2 pr-3 text-right font-medium">Discount</th>
            <th className="py-2 text-right font-medium">Collected</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row, index) => (
            <tr key={row.table_id || `none-${index}`} className="border-b border-line last:border-b-0">
              <td className="py-2.5 pr-3">
                <span className="font-medium">{sessionTableRowLabel([{ id: row.table_id, table_number: row.table_number, name: row.name }])}</span>
                {row.merged_bills ? <span className="block text-[11px] text-forest">Merged sessions: {row.merged_bills}</span> : null}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{row.bills || 0}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatBillMoney(row.gross)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatBillMoney(row.discount)}</td>
              <td className="py-2.5 text-right font-medium tabular-nums">{formatBillMoney(row.collected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">Merged sessions are counted once under their primary table; all involved tables appear in the settlement detail.</p>
    </div>
  )
}
