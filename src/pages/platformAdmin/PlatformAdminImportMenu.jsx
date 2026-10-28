import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { fetchSheet, importMenu, listPlatformRestaurants } from '../../services/platformAdmin'
import { formatDateTime } from '../../lib/platformAdmin'
import {
  SAMPLE_SHEET_URL,
  buildRows,
  formatImportSuccess,
  formatVariantsPreview,
  guessMapping,
  IMPORT_FIELDS,
  newImportRequestId,
  parseCsvText,
  resolveVariantColumns,
  summarizeImport,
} from '../../lib/menuImport'

export default function PlatformAdminImportMenu() {
  const [searchParams] = useSearchParams()
  const [restaurants, setRestaurants] = useState([])
  const [restaurantId, setRestaurantId] = useState(searchParams.get('restaurant') || '')
  const [url, setUrl] = useState(SAMPLE_SHEET_URL)
  const [grid, setGrid] = useState(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const importLock = useRef(false)
  const fileRef = useRef(null)

  useEffect(() => {
    listPlatformRestaurants({ pageSize: 100 }).then(({ data }) => {
      setRestaurants(data?.items || [])
    })
  }, [])

  const headers = useMemo(() => (grid && grid[headerRow] ? grid[headerRow] : []), [grid, headerRow])
  const { rows, errors } = useMemo(
    () => (grid ? buildRows(grid, mapping, { headerRow }) : { rows: [], errors: [] }),
    [grid, mapping, headerRow],
  )
  const summary = summarizeImport({ rows, errors })

  const applyGrid = useCallback((nextGrid) => {
    setGrid(nextGrid)
    setHeaderRow(0)
    setMapping(guessMapping(nextGrid[0] || []))
    setNotice('')
    setError('')
    setLastResult(null)
  }, [])

  async function onFetchSheet() {
    if (!url.trim()) {
      setError('Paste a Google Sheets URL first.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error: nextError } = await fetchSheet(url.trim())
    setBusy(false)
    if (nextError) {
      setError(`${nextError.message} You can also upload a CSV export instead.`)
      return
    }
    applyGrid(data.rows)
    setNotice(`Loaded ${data.rows.length} rows from the sheet.`)
  }

  function onFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        applyGrid(parseCsvText(String(reader.result || '')))
        setNotice(`Loaded ${file.name}.`)
      } catch {
        setError('Could not read that file. Use a CSV export.')
      }
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  async function onImport() {
    if (importLock.current || importing) return
    if (!restaurantId) {
      setError('Select the restaurant to import into.')
      return
    }
    if (!rows.length) {
      setError('There are no valid rows to import.')
      return
    }
    importLock.current = true
    setImporting(true)
    setError('')
    setNotice('')
    setLastResult(null)
    const { data, error: nextError } = await importMenu(restaurantId, rows, newImportRequestId())
    importLock.current = false
    setImporting(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    if (!data || data.ok === false) {
      setError('Import did not complete. The preview is unchanged so you can retry.')
      return
    }
    const completedAt = formatDateTime(data.completed_at || new Date().toISOString())
    const restaurantName = selected?.name || data.restaurant_name || 'selected restaurant'
    setLastResult({ ...data, restaurant_name: restaurantName, completed_at: completedAt })
    setNotice(formatImportSuccess(data, { restaurantName, completedAt }))
  }

  const selected = restaurants.find((r) => r.id === restaurantId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Import Menu</h1>
        <p className="mt-1 text-sm text-slate-500">
          Founder-only. Load a Google Sheet or CSV, map columns (including Quarter / Half / Full), review the
          preview, then import into an existing restaurant. Existing menu items are never deleted or overwritten.
        </p>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            Target restaurant
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="">Select a restaurant…</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.owner_username ? `· ${r.owner_username}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-500">
            Google Sheets URL
            <div className="mt-1 flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
              />
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={onFetchSheet} disabled={busy}>
                {busy ? 'Loading…' : 'Load'}
              </Button>
            </div>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setUrl(SAMPLE_SHEET_URL)}
            className="text-xs text-blue-700 hover:underline"
          >
            Use the sample sheet URL
          </button>
          <span className="text-xs text-slate-300">|</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-blue-700 hover:underline"
          >
            Upload CSV file instead
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </div>
      </div>

      {grid ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Column mapping</h2>
              <label className="text-xs font-medium text-slate-500">
                Header row
                <select
                  value={headerRow}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    setHeaderRow(next)
                    setMapping(guessMapping(grid[next] || []))
                  }}
                  className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                >
                  {grid.slice(0, 6).map((_, i) => (
                    <option key={i} value={i}>
                      Row {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((field) => (
                <label key={field.key} className="text-xs font-medium text-slate-500">
                  {field.label}
                  {field.required ? <span className="text-red-600"> *</span> : null}
                  <select
                    value={mapping[field.key] ?? -1}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.key]: Number(e.target.value) }))}
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value={-1}>— Not mapped —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {headers.length ? (
              <fieldset className="mt-4">
                <legend className="text-xs font-medium text-slate-500">Size / variant price columns</legend>
                <p className="mt-1 text-xs text-slate-400">
                  Tick extra columns such as Quarter, Half, Full. Veg / Non-veg is never treated as a size.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {headers.map((h, i) => {
                    const used = IMPORT_FIELDS.some((field) => mapping[field.key] === i)
                    if (used) return null
                    const checked = Array.isArray(mapping.variantColumns)
                      ? mapping.variantColumns.includes(i)
                      : resolveVariantColumns(headers, mapping).some((col) => col.index === i)
                    return (
                      <label
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setMapping((m) => {
                              const current = Array.isArray(m.variantColumns)
                                ? m.variantColumns.slice()
                                : resolveVariantColumns(headers, m).map((col) => col.index)
                              const next = current.includes(i)
                                ? current.filter((idx) => idx !== i)
                                : [...current, i]
                              return { ...m, variantColumns: next }
                            })
                          }}
                        />
                        {h || `Column ${i + 1}`}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-semibold text-emerald-700">{summary.valid}</p>
              <p className="text-xs text-slate-500">Valid rows</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-semibold text-red-700">{summary.invalid}</p>
              <p className="text-xs text-slate-500">Rows with errors</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-semibold text-slate-900">{summary.categories}</p>
              <p className="text-xs text-slate-500">Categories</p>
            </div>
          </div>

          {errors.length ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-medium text-red-800">Row errors ({errors.length})</h3>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-red-700">
                {errors.slice(0, 50).map((e) => (
                  <li key={e.rowNumber}>
                    Row {e.rowNumber}{e.name ? ` (${e.name})` : ''}: {e.messages.join(', ')}
                  </li>
                ))}
              </ul>
              {errors.length > 50 ? <p className="mt-1 text-xs text-red-600">Showing first 50 errors.</p> : null}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Row</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Price / variants</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-4 py-2 text-slate-400">{row.rowNumber}</td>
                    <td className="px-4 py-2 text-slate-600">{row.category}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-2 text-slate-600">{formatVariantsPreview(row)}</td>
                    <td className="px-4 py-2 text-slate-600">{row.food_type === 'non_veg' ? 'Non-veg' : 'Veg'}</td>
                    <td className="px-4 py-2 text-slate-600">{row.is_available ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 ? (
              <p className="px-4 py-2 text-xs text-slate-400">Previewing first 100 of {rows.length} valid rows.</p>
            ) : null}
          </div>

          {lastResult ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-medium">Menu import completed successfully</p>
              <p className="mt-1">
                {lastResult.restaurant_name} · {lastResult.completed_at}
              </p>
              <p className="mt-2 text-xs">
                {lastResult.created_items || 0} items created · {lastResult.created_variants || 0} variants created ·{' '}
                {lastResult.skipped_items || 0} existing items skipped · {lastResult.conflicts || 0} conflicts ·{' '}
                {lastResult.failed_rows || 0} failed rows
              </p>
              {Array.isArray(lastResult.conflict_samples) && lastResult.conflict_samples.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                  {lastResult.conflict_samples.map((row, index) => (
                    <li key={`${row.item}-${row.variant}-${index}`}>
                      {row.item}
                      {row.variant ? ` / ${row.variant}` : ''}: kept {row.existing}, source had {row.incoming}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Importing into <span className="font-medium text-slate-700">{selected?.name || 'no restaurant selected'}</span>
            </p>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={onImport} disabled={importing || !rows.length || !restaurantId}>
              {importing ? 'Importing menu…' : `Import ${rows.length} items`}
            </Button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Load a Google Sheet or upload a CSV to begin. Direct sheet fetch requires the sheet to be shared publicly; if
          that is unavailable, upload a CSV export.
        </div>
      )}
    </div>
  )
}
