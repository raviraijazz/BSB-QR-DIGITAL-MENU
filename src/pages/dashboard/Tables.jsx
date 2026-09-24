import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import NavIcon from '../../components/NavIcon'
import Spinner from '../../components/Spinner'
import { tableMenuUrl } from '../../lib/menuUrl'
import { nextTableNumber, tableHeading } from '../../lib/tableToken'
import {
  canvasToBlob,
  canvasToDataUrl,
  createQrCanvas,
  createQrMatrix,
  downloadBrandedPdf,
  downloadDataUrl,
  downloadPrintPdf,
  renderPrintCanvas,
} from '../../lib/qrStudio'
import {
  createTable,
  deleteTable,
  hasDuplicateTableNumber,
  isTableActive,
  listTables,
  updateTable,
} from '../../services/tables'
import { assignmentsByTableId, listAssignments } from '../../services/waiterAssignments'
import { listWaiters } from '../../services/waiters'

const emptyForm = { table_number: '', name: '', is_active: true }
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'qr_active', label: 'QR Active' },
  { key: 'qr_inactive', label: 'QR Inactive' },
]

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fallback below */
  }
  try {
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.left = '-9999px'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(field)
    return ok
  } catch {
    return false
  }
}

function tableUrl(restaurant, table) {
  if (!restaurant?.slug || !table?.qr_token) return ''
  return tableMenuUrl(restaurant.slug, table.qr_token)
}

function tableFileBase(restaurant, table) {
  const slug = restaurant?.slug || 'menu'
  const number = String(table?.table_number || table?.name || 'table')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}-table-${number || 'qr'}`
}

function qrOptions(url) {
  const matrix = url ? createQrMatrix(url) : null
  return {
    matrix,
    fg: '#1c1917',
    bg: '#ffffff',
    style: 'square',
    showLogo: false,
    logoImg: null,
    logoSize: 'medium',
  }
}

function tableCapacity(table) {
  const value = Number(table?.capacity)
  return Number.isFinite(value) && value > 0 ? value : null
}

function TableModal({ open, title, form, onChange, onClose, onSubmit, busy, error, submitLabel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
        <h2 className="font-display text-xl">{title}</h2>
        <div className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          <Field label="Table Number" hint="Required. Must be unique for this restaurant.">
            <input
              className={inputClass}
              placeholder="e.g. 1 or 01"
              value={form.table_number}
              onChange={(e) => onChange('table_number', e.target.value)}
            />
          </Field>
          <Field label="Table Name" hint="Optional. Example: Window Seat, Patio">
            <input
              className={inputClass}
              placeholder="e.g. Window Seat"
              value={form.name}
              onChange={(e) => onChange('name', e.target.value)}
            />
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
            <span className="text-sm font-medium">QR Active</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.is_active}
              onClick={() => onChange('is_active', !form.is_active)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${form.is_active ? 'bg-forest' : 'bg-stone-300'}`}
            >
              <span
                className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition"
                style={{ left: form.is_active ? '1.4rem' : '0.15rem' }}
              />
            </button>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  )
}

function QrModal({ open, restaurant, table, onClose, onDownload, onPrint, busy }) {
  const url = tableUrl(restaurant, table)
  const options = useMemo(() => qrOptions(url), [url])
  const preview = useMemo(() => {
    if (!options.matrix) return ''
    try {
      return canvasToDataUrl(createQrCanvas(280, options))
    } catch {
      return ''
    }
  }, [options])

  if (!open || !table) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close QR" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-card p-5 text-center shadow-lg">
        <p className="font-display text-xl">{restaurant?.name}</p>
        <p className="mt-1 text-sm font-medium text-forest">{tableHeading(table)}</p>
        <div className="mx-auto my-4 grid h-56 w-56 place-items-center rounded-2xl border border-line bg-white p-3">
          {preview ? <img src={preview} alt="" className="h-full w-full" /> : <NavIcon name="qr" className="h-10 w-10 text-muted" />}
        </div>
        <p className="break-all text-[11px] text-muted">{url}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onDownload} disabled={Boolean(busy)}>
            {busy === 'png' ? 'Preparing...' : 'Download QR'}
          </Button>
          <Button onClick={onPrint} disabled={Boolean(busy)}>
            {busy === 'print' ? 'Preparing...' : 'Print'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <Card compact className="!p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-[1.75rem] leading-none">{value}</p>
    </Card>
  )
}

function TableFloorCard({ table, waiter, active, onOpen }) {
  const seats = tableCapacity(table)
  return (
    <button
      type="button"
      onClick={() => onOpen(table)}
      className={`flex min-h-[148px] w-full flex-col rounded-[1.6rem] border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
        active ? 'border-forest/25' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-lg leading-tight">{tableHeading(table)}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${active ? 'bg-forest/10 text-forest' : 'bg-paper text-muted'}`}>
          {active ? 'QR Active' : 'QR Inactive'}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{seats ? `${seats} seats` : 'Capacity not set'}</p>
      <div className="mt-auto pt-3">
        {waiter ? (
          <p className="text-sm font-medium">
            {waiter.waiter_id}
            {waiter.is_active === false ? <span className="ml-1 text-xs font-normal text-muted">Disabled</span> : null}
          </p>
        ) : (
          <p className="text-sm text-muted">Unassigned</p>
        )}
        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-muted">Operational status</p>
        <p className="text-xs text-forest">Ready for service</p>
      </div>
    </button>
  )
}

function TableDetailDrawer({
  open,
  table,
  waiter,
  restaurant,
  onClose,
  onEdit,
  onQr,
  onDownload,
  onPrint,
  onCopy,
  onToggle,
  onRemove,
  busy,
}) {
  if (!open || !table) return null
  const active = isTableActive(table)
  const seats = tableCapacity(table)
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close table" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Table</p>
            <h2 className="mt-1 font-display text-2xl">{tableHeading(table)}</h2>
            <p className="mt-1 text-sm text-muted">{restaurant?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-line">
            <NavIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Capacity</p>
            <p className="mt-1 font-medium">{seats ? `${seats} seats` : 'Not set'}</p>
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Assigned waiter</p>
            {waiter ? (
              <>
                <p className="mt-1 font-medium">{waiter.full_name}</p>
                <p className="font-mono text-xs text-muted">{waiter.waiter_id}</p>
                {waiter.is_active === false ? <p className="mt-1 text-xs text-muted">Assigned to {waiter.full_name} · Disabled</p> : null}
              </>
            ) : (
              <p className="mt-1 text-muted">Unassigned</p>
            )}
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">QR status</p>
            <p className="mt-1 font-medium">{active ? 'QR Active' : 'QR Inactive'}</p>
            <p className="mt-1 text-xs text-muted">{table.qr_token ? 'QR token ready' : 'QR token missing'}</p>
          </div>
          <div className="rounded-2xl border border-dashed border-line bg-paper/60 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Operational status</p>
            <p className="mt-1 font-medium text-forest">Ready for service</p>
            <p className="mt-1 text-xs text-muted">Session, order and bill status will appear here later. Nothing is stored yet.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onEdit(table)}>
            Edit Table
          </Button>
          <Link to="/dashboard/table-wise/waiters">
            <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]">
              Manage Assignment
            </Button>
          </Link>
          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onQr(table)}>
            Open QR
          </Button>
          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onDownload(table)} disabled={Boolean(busy)}>
            Download QR
          </Button>
          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onPrint(table)} disabled={Boolean(busy)}>
            Print
          </Button>
          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onCopy(table)}>
            Copy link
          </Button>
          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onToggle(table)}>
            {active ? 'Deactivate QR' : 'Activate QR'}
          </Button>
          <Button variant="danger" className="h-9 px-3 py-0 text-[13px]" onClick={() => onRemove(table)}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Tables() {
  const { restaurant, loading } = useOutletContext()
  const [items, setItems] = useState([])
  const [waiters, setWaiters] = useState([])
  const [assignments, setAssignments] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [modal, setModal] = useState('')
  const [editing, setEditing] = useState(null)
  const [qrTable, setQrTable] = useState(null)
  const [selected, setSelected] = useState(null)
  const [formError, setFormError] = useState('')
  const [qrBusy, setQrBusy] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  async function load() {
    if (!restaurant) {
      setItems([])
      setWaiters([])
      setAssignments([])
      return
    }
    const [tablesResult, waitersResult, assignmentsResult] = await Promise.all([
      listTables(restaurant.id),
      listWaiters(restaurant.id),
      listAssignments(restaurant.id),
    ])
    const nextError = tablesResult.error || waitersResult.error || assignmentsResult.error
    if (nextError) setError(nextError.message)
    else setError('')
    setItems(tablesResult.data ?? [])
    setWaiters(waitersResult.data ?? [])
    setAssignments(assignmentsResult.data ?? [])
  }

  useEffect(() => {
    setItems([])
    setWaiters([])
    setAssignments([])
    setError('')
    setNotice('')
    setModal('')
    setEditing(null)
    setQrTable(null)
    setSelected(null)
    setQuery('')
    setFilter('all')
    load()
  }, [restaurant?.id])

  const waiterByTable = useMemo(() => {
    const map = new Map()
    const owners = assignmentsByTableId(assignments)
    for (const table of items) {
      const row = owners.get(table.id)
      map.set(table.id, row ? waiters.find((item) => item.id === row.waiter_id) || null : null)
    }
    return map
  }, [items, assignments, waiters])

  const selectedLive = selected ? items.find((item) => item.id === selected.id) || selected : null

  const stats = useMemo(() => {
    const assigned = items.filter((item) => waiterByTable.get(item.id)).length
    const qrActive = items.filter((item) => isTableActive(item)).length
    return {
      total: items.length,
      assigned,
      unassigned: items.length - assigned,
      qrActive,
    }
  }, [items, waiterByTable])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const waiter = waiterByTable.get(item.id)
      const assigned = Boolean(waiter)
      const active = isTableActive(item)
      if (filter === 'assigned' && !assigned) return false
      if (filter === 'unassigned' && assigned) return false
      if (filter === 'qr_active' && !active) return false
      if (filter === 'qr_inactive' && active) return false
      if (!needle) return true
      const hay = `${item.table_number || ''} ${item.name || ''} ${tableHeading(item)}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [items, waiterByTable, filter, query])

  function setFormField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openAdd() {
    setForm({ ...emptyForm, table_number: nextTableNumber(items), is_active: true })
    setFormError('')
    setEditing(null)
    setModal('add')
  }

  function openEdit(item) {
    setForm({
      table_number: item.table_number || item.name || '',
      name: item.name && item.name !== item.table_number ? item.name : '',
      is_active: isTableActive(item),
    })
    setFormError('')
    setEditing(item)
    setModal('edit')
  }

  function closeModal() {
    if (busy) return
    setModal('')
    setEditing(null)
    setFormError('')
  }

  async function onSave(event) {
    event.preventDefault()
    if (!form.table_number.trim()) {
      setFormError('Table number required')
      return
    }
    if (hasDuplicateTableNumber(items, form.table_number, editing?.id)) {
      setFormError('This table number already exists for this restaurant.')
      return
    }
    setBusy(true)
    setFormError('')
    const payload = {
      table_number: form.table_number,
      name: form.name,
      is_active: form.is_active,
    }
    const result = editing
      ? await updateTable(editing.id, restaurant.id, payload)
      : await createTable(restaurant.id, payload, items.length)
    setBusy(false)
    if (result.error) {
      setFormError(result.error.message)
      return
    }
    setModal('')
    setEditing(null)
    setNotice(editing ? `${tableHeading(result.data)} updated.` : `${tableHeading(result.data)} added.`)
    load()
  }

  async function toggleActive(item) {
    const next = !isTableActive(item)
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_active: next } : row)))
    const { error: nextError } = await updateTable(item.id, restaurant.id, { is_active: next })
    if (nextError) {
      setError(nextError.message)
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_active: item.is_active } : row)))
      return
    }
    setNotice(`${tableHeading(item)} ${next ? 'QR activated' : 'QR deactivated'}.`)
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${tableHeading(item)}? Its table QR will stop working.`)) return
    const { error: nextError } = await deleteTable(item.id, restaurant.id)
    if (nextError) setError(nextError.message)
    else {
      setNotice(`${tableHeading(item)} deleted.`)
      setSelected(null)
      load()
    }
  }

  async function downloadQr(table) {
    const url = tableUrl(restaurant, table)
    const options = qrOptions(url)
    if (!options.matrix) {
      setError('The QR code could not be generated.')
      return
    }
    setQrBusy('png')
    setError('')
    try {
      const blob = await canvasToBlob(createQrCanvas(1024, options))
      const href = URL.createObjectURL(blob)
      downloadDataUrl(`${tableFileBase(restaurant, table)}.png`, href)
      setTimeout(() => URL.revokeObjectURL(href), 1500)
    } catch (err) {
      setError(err.message)
    }
    setQrBusy('')
  }

  async function printQr(table) {
    const url = tableUrl(restaurant, table)
    const options = qrOptions(url)
    if (!options.matrix) {
      setError('The QR code could not be generated.')
      return
    }
    setQrBusy('print')
    setError('')
    try {
      const canvas = renderPrintCanvas('tent', {
        restaurantName: restaurant.name,
        tableName: tableHeading(table),
        ...options,
      })
      await downloadPrintPdf('tent', canvas, `${tableFileBase(restaurant, table)}-print.pdf`)
    } catch (err) {
      try {
        await downloadBrandedPdf({
          name: restaurant.name,
          tableName: tableHeading(table),
          url,
          qrCanvas: createQrCanvas(1024, options),
          filename: `${tableFileBase(restaurant, table)}.pdf`,
        })
      } catch (next) {
        setError(next.message || err.message)
      }
    }
    setQrBusy('')
  }

  async function copyLink(table) {
    const ok = await copyText(tableUrl(restaurant, table))
    setNotice(ok ? `${tableHeading(table)} link copied.` : 'Could not copy the link.')
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Tables belong to a restaurant and each gets its own QR."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Floor / Tables</h1>
          <p className="mt-1 text-sm text-muted">Manage restaurant tables and view their operational layout.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard/table-wise/waiters">
            <Button variant="secondary">Manage Assignments</Button>
          </Link>
          <Button onClick={openAdd}>
            <NavIcon name="plus" className="h-4 w-4" />
            Add Table
          </Button>
        </div>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Tables" value={stats.total} />
        <SummaryCard label="Assigned Tables" value={stats.assigned} />
        <SummaryCard label="Unassigned Tables" value={stats.unassigned} />
        <SummaryCard label="QR Active" value={stats.qrActive} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No tables added yet"
          body="Create table-wise QR codes so each table can have its own menu QR."
          actionLabel="+ Add Table"
          onAction={openAdd}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    filter === item.key ? 'bg-forest text-white' : 'border border-line bg-white text-stone-600 hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              className={`${inputClass} lg:max-w-xs`}
              placeholder="Search tables..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-10 text-center text-sm text-muted">
              No tables match this search or filter.
            </p>
          ) : (
            <div className="rounded-[1.8rem] border border-line bg-paper/70 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {visible.map((item) => (
                  <TableFloorCard
                    key={item.id}
                    table={item}
                    waiter={waiterByTable.get(item.id)}
                    active={isTableActive(item)}
                    onOpen={setSelected}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {items.length > 0 ? (
        <p className="text-xs text-muted">
          Brand, bulk print, and table QR studio live in{' '}
          <Link className="underline" to="/dashboard/qr">
            QR Studio
          </Link>
          . Editing a table never regenerates its QR token.
        </p>
      ) : null}

      <TableModal
        open={modal === 'add' || modal === 'edit'}
        title={modal === 'edit' ? 'Edit table' : 'Add Table'}
        form={form}
        onChange={setFormField}
        onClose={closeModal}
        onSubmit={onSave}
        busy={busy}
        error={formError}
        submitLabel={modal === 'edit' ? 'Save' : 'Add Table'}
      />
      <QrModal
        open={Boolean(qrTable)}
        restaurant={restaurant}
        table={qrTable}
        onClose={() => setQrTable(null)}
        onDownload={() => downloadQr(qrTable)}
        onPrint={() => printQr(qrTable)}
        busy={qrBusy}
      />
      <TableDetailDrawer
        open={Boolean(selectedLive)}
        table={selectedLive}
        waiter={selectedLive ? waiterByTable.get(selectedLive.id) : null}
        restaurant={restaurant}
        onClose={() => setSelected(null)}
        onEdit={(item) => {
          setSelected(null)
          openEdit(item)
        }}
        onQr={(item) => setQrTable(item)}
        onDownload={downloadQr}
        onPrint={printQr}
        onCopy={copyLink}
        onToggle={toggleActive}
        onRemove={remove}
        busy={qrBusy}
      />
    </div>
  )
}
