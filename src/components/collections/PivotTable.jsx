import { GROUP_OPTIONS, MEASURES } from '../../lib/analyticsCatalog'
import { formatMeasure } from '../../lib/analyticsEngine'
import { formatBillMoney } from '../../lib/orderCart'

export default function PivotTable({ pivot, config }) {
  const rows = pivot?.rows || []
  const columns = pivot?.columns || []
  const measure = MEASURES.find((row) => row.id === (pivot?.measure || config.pivotMeasure)) || MEASURES[0]
  const rowGroups = config.pivotRows?.length ? config.pivotRows : config.groups?.slice(0, 1) || []

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-10 text-center text-sm text-muted">
        No pivot values for this period. Choose a row group and a column group.
      </p>
    )
  }

  function cell(value) {
    return measure.kind === 'money' ? formatBillMoney(value) : formatMeasure(measure.id, value)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {(rowGroups.map((id) => GROUP_OPTIONS.find((row) => row.id === id)?.label || id).join(' / ') || 'All')}
        {config.pivotCols?.[0] ? ` by ${GROUP_OPTIONS.find((row) => row.id === config.pivotCols[0])?.label || config.pivotCols[0]}` : ''}
        {` · ${measure.label}`}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-[11px] uppercase tracking-[0.12em] text-muted">
              {rowGroups.map((id) => (
                <th key={id} className="px-3 py-2 text-left font-medium">
                  {GROUP_OPTIONS.find((row) => row.id === id)?.label || id}
                </th>
              ))}
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-right font-medium">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                {rowGroups.map((id) => (
                  <td key={id} className="px-3 py-2">
                    {row.labels[id] || '—'}
                  </td>
                ))}
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-right tabular-nums">
                    {cell(row.values[col.key] || 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium tabular-nums">{cell(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
