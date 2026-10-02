import { formatBillMoney } from '../../lib/orderCart'
import { formatDayLabel } from '../../lib/reportDates'

function compactMoney(value) {
  const n = Number(value) || 0
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return `₹${Math.round(n)}`
}

export default function CollectionTrendChart({ mode = 'day', days = [], hours = [] }) {
  const rows =
    mode === 'hour'
      ? (hours || []).map((row) => ({
          key: `h-${row.hour}`,
          label: `${String(row.hour).padStart(2, '0')}:00`,
          amount: Number(row.amount) || 0,
          count: Number(row.count) || 0,
        }))
      : (days || []).map((row) => ({
          key: row.day,
          label: formatDayLabel(row.day),
          amount: Number(row.amount) || 0,
          count: Number(row.count) || 0,
        }))

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-8 text-center text-sm text-muted">
        No collections in this period
      </p>
    )
  }

  const max = Math.max(...rows.map((row) => row.amount), 1)

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-end gap-2" style={{ minWidth: `${Math.max(rows.length * 2.5, 16)}rem` }}>
        {rows.map((row) => (
          <div key={row.key} className="flex min-w-[2rem] flex-1 flex-col items-center">
            <span className="mb-1 h-4 text-[10px] tabular-nums text-muted">{row.amount ? compactMoney(row.amount) : ''}</span>
            <div
              className="flex h-32 w-full items-end justify-center"
              title={`${row.label} · ${formatBillMoney(row.amount)} · ${row.count} ${row.count === 1 ? 'payment' : 'payments'}`}
            >
              <div
                className="w-full max-w-[34px] rounded-t-md bg-gradient-to-t from-forest to-forest/55"
                style={{ height: `${Math.max((row.amount / max) * 100, row.amount > 0 ? 4 : 1)}%` }}
              />
            </div>
            <span className="mt-1 w-full truncate text-center text-[10px] text-muted">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
