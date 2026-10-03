import { useState } from 'react'
import Button from '../Button'
import Field, { inputClass } from '../Field'
import {
  REPORT_TYPES,
  allowedColumns,
  allowedGroups,
  allowedMeasures,
  reportMeta,
} from '../../lib/analyticsCatalog'
import { REPORT_RANGE_PRESETS } from '../../lib/reportDates'
import { tableHeading } from '../../lib/tableToken'

const CHIP = (active) =>
  `rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
    active ? 'bg-ink text-white' : 'bg-white text-muted border border-line hover:text-ink'
  }`

const RANGE_CHIP = (active) =>
  `rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
    active ? 'bg-forest text-white' : 'bg-paper text-muted hover:text-ink'
  }`

function MultiChips({ options, value, onChange, max = 3 }) {
  const selected = value || []
  function toggle(id) {
    if (selected.includes(id)) onChange(selected.filter((item) => item !== id))
    else if (selected.length < max) onChange([...selected, id])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => toggle(option.id)} className={CHIP(selected.includes(option.id))}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function ReportToolbar({
  config,
  onChange,
  range,
  customFrom,
  customTo,
  onRange,
  onCustomFrom,
  onCustomTo,
  tables,
  waiters,
  categories,
  menuItems,
  saved,
  onLoadSaved,
  onSave,
  onUpdateSaved,
  onDeleteSaved,
  onFavorite,
  saving,
  views,
  extraFilters,
}) {
  const [saveName, setSaveName] = useState('')
  const [open, setOpen] = useState({ filters: true, group: false, columns: false, saved: false })
  const type = config.reportType || 'collections'
  const filters = config.filters || {}
  const meta = reportMeta(type)

  function patch(next) {
    onChange({ ...config, ...next })
  }

  function patchFilter(key, value) {
    patch({ filters: { ...filters, [key]: value } })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {REPORT_TYPES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange({ ...config, reportType: option.id })}
            className={CHIP(type === option.id)}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{meta.hint}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {REPORT_RANGE_PRESETS.map((preset) => (
          <button key={preset.id} type="button" onClick={() => onRange(preset.id)} className={RANGE_CHIP(config.rangePreset === preset.id)}>
            {preset.label}
          </button>
        ))}
        {config.rangePreset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 pl-1">
            <Field label="">
              <input type="date" className={`${inputClass} py-1.5`} value={customFrom} max={customTo} onChange={(event) => onCustomFrom(event.target.value)} />
            </Field>
            <span className="text-muted">to</span>
            <Field label="">
              <input type="date" className={`${inputClass} py-1.5`} value={customTo} min={customFrom} onChange={(event) => onCustomTo(event.target.value)} />
            </Field>
          </div>
        ) : null}
      </div>

      {views ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {views.map((view) => (
            <button key={view.id} type="button" onClick={() => patch({ view: view.id })} className={CHIP(config.view === view.id)}>
              {view.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-xs font-medium uppercase tracking-[0.14em] text-muted" onClick={() => setOpen((value) => ({ ...value, filters: !value.filters }))}>
          Filters {open.filters ? '–' : '+'}
        </button>
        <button type="button" className="text-xs font-medium uppercase tracking-[0.14em] text-muted" onClick={() => setOpen((value) => ({ ...value, group: !value.group }))}>
          Group / Measures {open.group ? '–' : '+'}
        </button>
        <button type="button" className="text-xs font-medium uppercase tracking-[0.14em] text-muted" onClick={() => setOpen((value) => ({ ...value, columns: !value.columns }))}>
          Columns {open.columns ? '–' : '+'}
        </button>
        <button type="button" className="text-xs font-medium uppercase tracking-[0.14em] text-muted" onClick={() => setOpen((value) => ({ ...value, saved: !value.saved }))}>
          Saved {open.saved ? '–' : '+'}
        </button>
      </div>

      {open.filters ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Waiter">
            <select className={inputClass} value={filters.waiterId || ''} onChange={(event) => patchFilter('waiterId', event.target.value)}>
              <option value="">All waiters</option>
              {(waiters || []).map((waiter) => (
                <option key={waiter.id} value={waiter.id}>
                  {waiter.full_name || waiter.waiter_id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Table">
            <select className={inputClass} value={filters.tableId || ''} onChange={(event) => patchFilter('tableId', event.target.value)}>
              <option value="">All tables</option>
              {(tables || []).map((table) => (
                <option key={table.id} value={table.id}>
                  {tableHeading(table)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search">
            <input className={inputClass} value={config.search || ''} onChange={(event) => patch({ search: event.target.value })} placeholder="Bill, session, item, waiter" />
          </Field>
          {['collections', 'payments', 'waiters', 'tables'].includes(type) ? (
            <Field label="Payment method">
              <select className={inputClass} value={filters.method || ''} onChange={(event) => patchFilter('method', event.target.value)}>
                <option value="">All methods</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
            </Field>
          ) : null}
          {['collections', 'discounts', 'outstanding', 'waiters', 'tables'].includes(type) ? (
            <Field label="Bill status">
              <select className={inputClass} value={filters.billStatus || ''} onChange={(event) => patchFilter('billStatus', event.target.value)}>
                <option value="">All statuses</option>
                <option value="paid">Settled</option>
                <option value="payment_pending">Partially paid</option>
                <option value="open">Open</option>
              </select>
            </Field>
          ) : null}
          {type === 'sales' ? (
            <Field label="Order status">
              <select className={inputClass} value={filters.orderStatus || ''} onChange={(event) => patchFilter('orderStatus', event.target.value)}>
                <option value="">All</option>
                <option value="new">New</option>
                <option value="accepted">Accepted</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="served">Served</option>
              </select>
            </Field>
          ) : null}
          {type === 'kitchen' ? (
            <>
              <Field label="KOT status">
                <select className={inputClass} value={filters.kotStatus || ''} onChange={(event) => patchFilter('kotStatus', event.target.value)}>
                  <option value="">All</option>
                  <option value="new">New</option>
                  <option value="preparing">Preparing</option>
                  <option value="ready">Ready</option>
                </select>
              </Field>
              <Field label="Order type">
                <select className={inputClass} value={filters.kotType || ''} onChange={(event) => patchFilter('kotType', event.target.value)}>
                  <option value="">All</option>
                  <option value="new">New</option>
                  <option value="add_on">Add-on</option>
                  <option value="modification">Modification</option>
                  <option value="cancellation">Cancellation</option>
                  <option value="transfer">Transfer</option>
                </select>
              </Field>
            </>
          ) : null}
          {type === 'items' ? (
            <>
              <Field label="Category">
                <select className={inputClass} value={filters.categoryId || ''} onChange={(event) => patchFilter('categoryId', event.target.value)}>
                  <option value="">All categories</option>
                  {(categories || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Item">
                <select className={inputClass} value={filters.itemId || ''} onChange={(event) => patchFilter('itemId', event.target.value)}>
                  <option value="">All items</option>
                  {(menuItems || [])
                    .filter((item) => !filters.categoryId || item.category_id === filters.categoryId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          ) : null}
          {['collections', 'discounts', 'waiters', 'tables'].includes(type) ? (
            <Field label="Discount">
              <select className={inputClass} value={filters.discount || ''} onChange={(event) => patchFilter('discount', event.target.value)}>
                <option value="">All bills</option>
                <option value="yes">With discount</option>
                <option value="no">Without discount</option>
              </select>
            </Field>
          ) : null}
          {['collections', 'tables', 'waiters'].includes(type) ? (
            <Field label="Merged tables">
              <select className={inputClass} value={filters.merged || ''} onChange={(event) => patchFilter('merged', event.target.value)}>
                <option value="">All sessions</option>
                <option value="yes">Merged only</option>
                <option value="no">Single table</option>
              </select>
            </Field>
          ) : null}
          {extraFilters}
        </div>
      ) : null}

      {open.group ? (
        <div className="space-y-3 rounded-2xl border border-line bg-paper/50 p-3">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Group by</p>
            <MultiChips options={allowedGroups(type)} value={config.groups} onChange={(groups) => patch({ groups })} />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Measures</p>
            <MultiChips options={allowedMeasures(type)} value={config.measures} onChange={(measures) => patch({ measures })} max={6} />
          </div>
          {config.view === 'pivot' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Pivot rows">
                <select className={inputClass} value={config.pivotRows?.[0] || ''} onChange={(event) => patch({ pivotRows: event.target.value ? [event.target.value] : [] })}>
                  <option value="">All</option>
                  {allowedGroups(type).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pivot columns">
                <select className={inputClass} value={config.pivotCols?.[0] || ''} onChange={(event) => patch({ pivotCols: event.target.value ? [event.target.value] : [] })}>
                  <option value="">None</option>
                  {allowedGroups(type).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pivot measure">
                <select className={inputClass} value={config.pivotMeasure || ''} onChange={(event) => patch({ pivotMeasure: event.target.value })}>
                  {allowedMeasures(type).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}

      {open.columns && !config.groups?.length ? (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Visible columns</p>
          <MultiChips options={allowedColumns(type)} value={config.columns} onChange={(columns) => patch({ columns })} max={12} />
        </div>
      ) : null}

      {open.saved ? (
        <div className="space-y-3 rounded-2xl border border-line bg-paper/50 p-3">
          <div className="flex flex-wrap gap-2">
            <input className={`${inputClass} max-w-xs`} value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Report name" />
            <Button onClick={() => onSave(saveName)} disabled={saving}>
              Save current view
            </Button>
          </div>
          {(saved || []).length ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {saved.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <button type="button" className="min-w-0 text-left" onClick={() => onLoadSaved(row)}>
                    <span className="block truncate font-medium">{row.is_favorite ? '* ' : ''}{row.name}</span>
                    <span className="block text-[11px] text-muted">{reportMeta(row.report_type).label}</span>
                  </button>
                  <div className="flex gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onFavorite(row)}>
                      {row.is_favorite ? 'Unstar' : 'Star'}
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onUpdateSaved(row)}>
                      Overwrite
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs text-red-700" onClick={() => onDeleteSaved(row)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No saved reports yet. Views are stored per restaurant.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
