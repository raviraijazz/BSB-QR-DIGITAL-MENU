import Button from '../Button'
import { COLUMN_DEFS, GROUP_OPTIONS, MEASURES } from '../../lib/analyticsCatalog'
import { cellText, formatMeasure, groupedRowValues } from '../../lib/analyticsEngine'
import { formatBillMoney } from '../../lib/orderCart'

function measureKind(id) {
  return MEASURES.find((row) => row.id === id)?.kind || 'count'
}

function SortHead({ id, label, align, sort, onSort }) {
  const active = sort?.key === id
  return (
    <button
      type="button"
      onClick={() => onSort(id)}
      className={`flex w-full items-center gap-1 font-medium uppercase tracking-[0.12em] ${align === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      {label}
      <span className="text-[10px] text-muted">{active ? (sort.dir === 'asc' ? '^' : 'v') : ''}</span>
    </button>
  )
}

export default function ReportTable({ analytics, config, page, pageSize, onPage, onSort, emptyLabel }) {
  const groups = config.groups || []
  const sort = config.sort || { key: '', dir: 'desc' }
  const grouped = groups.length > 0
  const columns = grouped
    ? [
        ...groups.map((id) => ({ id, label: GROUP_OPTIONS.find((row) => row.id === id)?.label || id, kind: 'text' })),
        ...(config.measures || []).map((id) => ({ id, label: MEASURES.find((row) => row.id === id)?.label || id, kind: measureKind(id) })),
      ]
    : (config.columns || []).map((id) => COLUMN_DEFS[id]).filter(Boolean)

  const allRows = grouped
    ? (analytics.grouped || []).map((row) => ({ id: row.id, ...groupedRowValues(row, groups) }))
    : analytics.facts || []

  const sorted = allRows.slice().sort((a, b) => {
    if (!sort.key) return 0
    const left = a[sort.key]
    const right = b[sort.key]
    const bothNum = typeof left === 'number' && typeof right === 'number'
    const cmp = bothNum ? left - right : String(left ?? '').localeCompare(String(right ?? ''), 'en-IN', { numeric: true, sensitivity: 'base' })
    return sort.dir === 'asc' ? cmp : -cmp
  })

  const total = sorted.length
  const start = total ? page * pageSize : 0
  const rows = sorted.slice(start, start + pageSize)
  const end = start + rows.length

  if (!total) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-10 text-center text-sm text-muted">
        {emptyLabel || 'No rows for this report'}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-[11px] text-muted">
              {columns.map((col) => (
                <th key={col.id} className={`px-3 py-2 ${col.kind === 'money' || col.kind === 'count' ? 'text-right' : 'text-left'}`}>
                  <SortHead
                    id={col.id}
                    label={col.label}
                    align={col.kind === 'money' || col.kind === 'count' ? 'right' : 'left'}
                    sort={sort}
                    onSort={onSort}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || row.billId || row.orderId || row.paymentId || index} className="border-b border-line last:border-b-0">
                {columns.map((col) => {
                  const numeric = col.kind === 'money' || col.kind === 'count'
                  const value = grouped
                    ? numeric
                      ? col.kind === 'money'
                        ? formatBillMoney(row[col.id])
                        : formatMeasure(col.id, row[col.id])
                      : row[col.id] || '—'
                    : col.kind === 'money'
                      ? formatBillMoney(row[col.id])
                      : cellText(col.id, row)
                  return (
                    <td key={col.id} className={`px-3 py-2 ${numeric ? 'text-right tabular-nums' : 'truncate'}`}>
                      {value}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>
          {start + 1}–{end} of {total}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={page <= 0} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={end >= total} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
