import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import NavIcon from '../../components/NavIcon'
import Spinner from '../../components/Spinner'
import { tableMenuUrl } from '../../lib/menuUrl'
import { elapsedLabel, formatClock, formatMoney } from '../../lib/orderCart'
import { mergedTablesHint, nextTableNumber, sessionTablesLabel, tableHeading } from '../../lib/tableToken'
import { MergeTablesDialog, TransferTableDialog } from '../../components/TableMoveDialogs'
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
import { mergeTableSessions, tablesForSession, transferTableSession } from '../../services/tableMoves'
import { listOpenSessions, sessionForTable } from '../../services/tableSessions'
import { assignmentsByTableId, listAssignments } from '../../services/waiterAssignments'
import { listRestaurantOrders, orderSubtotal } from '../../services/waiterOrders'
import { listWaiters } from '../../services/waiters'

const emptyForm = { table_number: '', name: '', is_active: true }

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'occupied', label: 'Occupied' },
  { key: 'billing', label: 'Billing' },
  { key: 'out_of_service', label: 'Out of Service' },
]

const ASSIGN_FILTERS = [
  { key: 'all', label: 'All staff' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'unassigned', label: 'Unassigned' },
]

const SORTS = [
  { key: 'number', label: 'Table no.' },
  { key: 'status', label: 'Status' },
  { key: 'waiter', label: 'Waiter' },
]

const STATUS_META = {
  available: {
    label: 'Available',
    className: 'bg-forest/10 text-forest',
    dot: 'bg-forest',
    ring: 'border-forest/20',
  },
  occupied: {
    label: 'Occupied',
    className: 'bg-ink text-white',
    dot: 'bg-gold',
    ring: 'border-ink/20',
  },
  billing: {
    label: 'Billing',
    className: 'bg-gold/20 text-accent-dark',
    dot: 'bg-accent',
    ring: 'border-gold/40',
  },
  out_of_service: {
    label: 'Out of Service',
    className: 'bg-paper text-muted',
    dot: 'bg-stone-400',
    ring: 'border-line',
  },
}

const STATUS_RANK = { occupied: 0, billing: 1, available: 2, out_of_service: 3 }

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

function tableNumberSortValue(table) {
  const n = Number.parseInt(String(table?.table_number || ''), 10)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

function floorStatus(table, session) {
  if (session) {
    if (session.status === 'bill_requested' || session.status === 'payment_pending') return 'billing'
    return 'occupied'
  }
  if (!isTableActive(table)) return 'out_of_service'
  return 'available'
}

function waiterInitials(waiter) {
  const name = String(waiter?.full_name || waiter?.waiter_id || '?').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.available
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${meta.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function WaiterAvatar({ waiter, size = 'md' }) {
  const box = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-[11px]'
  if (!waiter) {
    return (
      <span className={`grid ${box} shrink-0 place-items-center rounded-full border border-dashed border-line bg-paper text-muted`}>
        —
      </span>
    )
  }
  return (
    <span
      className={`grid ${box} shrink-0 place-items-center rounded-full bg-forest text-white`}
      title={waiter.full_name || waiter.waiter_id}
    >
      {waiterInitials(waiter)}
    </span>
  )
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

function SummaryCard({ icon, label, value, hint }) {
  return (
    <Card compact className="!p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper text-forest">
          <NavIcon name={icon} className="h-4 w-4" />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      </div>
      <p className="mt-3 font-display text-[1.75rem] leading-none">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  )
}

function TableFloorCard({
  table,
  waiter,
  session,
  sessionTables,
  totals,
  menuOpen,
  onOpen,
  onMenu,
  onEdit,
  onAssign,
  onQr,
  onCopy,
  onToggle,
  onRemove,
  onMerge,
  onTransfer,
}) {
  const seats = tableCapacity(table)
  const status = floorStatus(table, session)
  const meta = STATUS_META[status]
  const qrActive = isTableActive(table)
  const amount = totals?.amount || 0
  const itemCount = totals?.items || 0
  const group = sessionTables || []
  const merged = group.length > 1
  const mergedHint = mergedTablesHint(group)

  return (
    <div
      className={`relative flex min-h-[196px] w-full flex-col rounded-[1.6rem] border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${meta.ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(table)} className="min-w-0 text-left">
          <p className="font-display text-lg leading-tight">{tableHeading(table)}</p>
          <p className="mt-1 text-xs text-muted">
            {merged ? sessionTablesLabel(group, { compact: true }) : seats ? `${seats} seats` : 'Capacity not set'}
          </p>
          {mergedHint ? <p className="mt-1 text-[11px] font-medium text-forest">{mergedHint}</p> : null}
        </button>
        <div className="flex items-start gap-1" data-table-menu>
          <StatusPill status={status} />
          <button
            type="button"
            aria-label="Table actions"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation()
              onMenu(menuOpen ? '' : table.id)
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink"
          >
            <NavIcon name="more" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          data-table-menu
          className="absolute right-3 top-12 z-20 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onEdit(table)}>
            Edit Table
          </button>
          {session ? (
            <>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onMerge(table)}>
                Merge Tables
              </button>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onTransfer(table)}>
                Transfer Table
              </button>
            </>
          ) : null}
          <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onAssign()}>
            Assign Waiter
          </button>
          <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onQr(table)}>
            Open QR
          </button>
          <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onCopy(table)}>
            Copy link
          </button>
          <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onToggle(table)}>
            {qrActive ? 'Deactivate QR' : 'Activate QR'}
          </button>
          <button type="button" className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => onRemove(table)}>
            Delete
          </button>
        </div>
      ) : null}

      <button type="button" onClick={() => onOpen(table)} className="mt-3 flex min-w-0 items-center gap-2 text-left">
        <WaiterAvatar waiter={waiter} />
        {waiter ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{waiter.full_name}</span>
            <span className="block font-mono text-[11px] text-muted">
              {waiter.waiter_id}
              {waiter.is_active === false ? ' · Disabled' : ''}
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted">Unassigned</span>
        )}
      </button>

      <button type="button" onClick={() => onOpen(table)} className="mt-auto w-full pt-3 text-left">
        {session ? (
          <div className="rounded-xl border border-line bg-paper/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[11px] uppercase tracking-[0.12em] text-muted">{session.session_number || 'Session'}</p>
              <p className="text-[11px] text-muted">{elapsedLabel(session.started_at) || formatClock(session.started_at)}</p>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="font-display text-lg leading-none">{amount ? formatMoney(amount) : '—'}</p>
              <p className="text-[11px] text-muted">
                {totals?.orders ? `${totals.orders} ${totals.orders === 1 ? 'order' : 'orders'}` : itemCount ? `${itemCount} items` : 'No items yet'}
              </p>
            </div>
            {merged ? <p className="mt-1 text-[11px] text-muted">{sessionTablesLabel(group, { compact: true })}</p> : null}
          </div>
        ) : qrActive ? (
          <p className="text-xs text-forest">Ready for service</p>
        ) : (
          <p className="text-xs text-muted">QR inactive · table stays listed, occupancy is unchanged</p>
        )}
      </button>
    </div>
  )
}

function TableDetailDrawer({
  open,
  table,
  waiter,
  session,
  sessionTables,
  totals,
  restaurant,
  onClose,
  onEdit,
  onQr,
  onDownload,
  onPrint,
  onCopy,
  onToggle,
  onRemove,
  onMerge,
  onTransfer,
  busy,
}) {
  if (!open || !table) return null
  const active = isTableActive(table)
  const seats = tableCapacity(table)
  const status = floorStatus(table, session)
  const amount = totals?.amount || 0
  const itemCount = totals?.items || 0
  const orderCount = totals?.orders || 0
  const group = sessionTables || []
  const mergedHint = mergedTablesHint(group)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close table" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Table</p>
            <h2 className="mt-1 font-display text-2xl">{tableHeading(table)}</h2>
            <p className="mt-1 text-sm text-muted">{restaurant?.name}</p>
            <div className="mt-2">
              <StatusPill status={status} />
            </div>
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
              <div className="mt-2 flex items-center gap-2">
                <WaiterAvatar waiter={waiter} />
                <div>
                  <p className="font-medium">{waiter.full_name}</p>
                  <p className="font-mono text-xs text-muted">{waiter.waiter_id}</p>
                  {waiter.is_active === false ? <p className="mt-1 text-xs text-muted">Login disabled</p> : null}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-muted">Unassigned</p>
            )}
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">QR status</p>
            <p className="mt-1 font-medium">{active ? 'QR Active' : 'QR Inactive'}</p>
            <p className="mt-1 text-xs text-muted">{table.qr_token ? 'QR token ready' : 'QR token missing'}</p>
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Session</p>
            {session ? (
              <>
                <p className="mt-1 font-medium">{session.session_number || 'Open session'}</p>
                {mergedHint ? <p className="mt-1 text-sm font-medium text-forest">{sessionTablesLabel(group, { compact: true })}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  Started {formatClock(session.started_at)}
                  {elapsedLabel(session.started_at) ? ` · ${elapsedLabel(session.started_at)}` : ''}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Running amount</p>
                    <p className="mt-0.5 font-display text-2xl leading-none">{amount ? formatMoney(amount) : '—'}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {orderCount ? `${orderCount} ${orderCount === 1 ? 'order' : 'orders'}` : 'No orders'}
                    {itemCount ? ` · ${itemCount} items` : ''}
                  </p>
                </div>
                <Link to="/dashboard/table-wise/orders" className="mt-3 inline-block text-sm font-medium text-forest hover:underline">
                  View session orders
                </Link>
              </>
            ) : (
              <>
                <p className="mt-1 font-medium">{status === 'out_of_service' ? 'Out of service' : 'Available'}</p>
                <p className="mt-1 text-xs text-muted">
                  Occupancy comes from open table sessions. QR active/inactive never marks a table occupied.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {session ? (
            <>
              <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onMerge(table)}>
                Merge Tables
              </Button>
              <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => onTransfer(table)}>
                Transfer Table
              </Button>
            </>
          ) : null}
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
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [waiters, setWaiters] = useState([])
  const [assignments, setAssignments] = useState([])
  const [sessions, setSessions] = useState([])
  const [orders, setOrders] = useState([])
  const [ready, setReady] = useState(false)
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
  const [assignFilter, setAssignFilter] = useState('all')
  const [sortKey, setSortKey] = useState('number')
  const [menuId, setMenuId] = useState('')
  const [moveMode, setMoveMode] = useState('')
  const [moveTableId, setMoveTableId] = useState('')
  const [moveBusy, setMoveBusy] = useState(false)

  async function load() {
    if (!restaurant) {
      setItems([])
      setWaiters([])
      setAssignments([])
      setSessions([])
      setOrders([])
      setReady(true)
      return
    }
    setReady(false)
    const [tablesResult, waitersResult, assignmentsResult, sessionsResult, ordersResult] = await Promise.all([
      listTables(restaurant.id),
      listWaiters(restaurant.id),
      listAssignments(restaurant.id),
      listOpenSessions(restaurant.id),
      listRestaurantOrders(restaurant.id),
    ])
    const nextError = tablesResult.error || waitersResult.error || assignmentsResult.error || sessionsResult.error || ordersResult.error
    if (nextError) setError(nextError.message)
    else setError('')
    setItems(tablesResult.data ?? [])
    setWaiters(waitersResult.data ?? [])
    setAssignments(assignmentsResult.data ?? [])
    setSessions(sessionsResult.data ?? [])
    setOrders(ordersResult.data ?? [])
    setReady(true)
  }

  useEffect(() => {
    setItems([])
    setWaiters([])
    setAssignments([])
    setSessions([])
    setOrders([])
    setError('')
    setNotice('')
    setModal('')
    setEditing(null)
    setQrTable(null)
    setSelected(null)
    setQuery('')
    setFilter('all')
    setAssignFilter('all')
    setSortKey('number')
    setMenuId('')
    setMoveMode('')
    setMoveTableId('')
    setReady(false)
    load()
  }, [restaurant?.id])

  useEffect(() => {
    if (!menuId) return undefined
    function onDoc(event) {
      if (!event.target.closest('[data-table-menu]')) setMenuId('')
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuId])

  const waiterByTable = useMemo(() => {
    const map = new Map()
    const owners = assignmentsByTableId(assignments)
    for (const table of items) {
      const row = owners.get(table.id)
      map.set(table.id, row ? waiters.find((item) => item.id === row.waiter_id) || null : null)
    }
    return map
  }, [items, assignments, waiters])

  const amountsBySession = useMemo(() => {
    const map = new Map()
    for (const order of orders || []) {
      if (!order?.session_id || order.status === 'cancelled') continue
      const prev = map.get(order.session_id) || { amount: 0, items: 0, orders: 0 }
      const lines = order.order_items || []
      prev.amount += orderSubtotal(lines)
      prev.items += lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
      prev.orders += 1
      map.set(order.session_id, prev)
    }
    return map
  }, [orders])

  const selectedLive = selected ? items.find((item) => item.id === selected.id) || selected : null
  const selectedSession = selectedLive ? sessionForTable(sessions, selectedLive.id) : null

  const stats = useMemo(() => {
    let occupied = 0
    let available = 0
    let billing = 0
    let out = 0
    const seenSessions = new Set()
    let running = 0
    for (const table of items) {
      const session = sessionForTable(sessions, table.id)
      const status = floorStatus(table, session)
      if (status === 'occupied') occupied += 1
      else if (status === 'billing') billing += 1
      else if (status === 'out_of_service') out += 1
      else available += 1
      if (session && !seenSessions.has(session.id)) {
        seenSessions.add(session.id)
        running += amountsBySession.get(session.id)?.amount || 0
      }
    }
    return {
      total: items.length,
      occupied,
      available,
      billing,
      out,
      running,
    }
  }, [items, sessions, amountsBySession])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = items.filter((item) => {
      const waiter = waiterByTable.get(item.id)
      const session = sessionForTable(sessions, item.id)
      const status = floorStatus(item, session)
      const assigned = Boolean(waiter)
      if (filter !== 'all' && status !== filter) return false
      if (assignFilter === 'assigned' && !assigned) return false
      if (assignFilter === 'unassigned' && assigned) return false
      if (!needle) return true
      const hay = `${item.table_number || ''} ${item.name || ''} ${tableHeading(item)} ${waiter?.full_name || ''} ${waiter?.waiter_id || ''} ${session?.session_number || ''}`.toLowerCase()
      return hay.includes(needle)
    })

    rows.sort((a, b) => {
      const waiterA = waiterByTable.get(a.id)
      const waiterB = waiterByTable.get(b.id)
      const sessionA = sessionForTable(sessions, a.id)
      const sessionB = sessionForTable(sessions, b.id)
      if (sortKey === 'status') {
        const diff = (STATUS_RANK[floorStatus(a, sessionA)] ?? 9) - (STATUS_RANK[floorStatus(b, sessionB)] ?? 9)
        if (diff) return diff
      }
      if (sortKey === 'waiter') {
        const nameA = String(waiterA?.full_name || waiterA?.waiter_id || 'zzzz')
        const nameB = String(waiterB?.full_name || waiterB?.waiter_id || 'zzzz')
        const diff = nameA.localeCompare(nameB)
        if (diff) return diff
      }
      const num = tableNumberSortValue(a) - tableNumberSortValue(b)
      if (num) return num
      return tableHeading(a).localeCompare(tableHeading(b))
    })
    return rows
  }, [items, waiterByTable, sessions, filter, assignFilter, query, sortKey])

  function setFormField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openAdd() {
    setForm({ ...emptyForm, table_number: nextTableNumber(items), is_active: true })
    setFormError('')
    setEditing(null)
    setMenuId('')
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
    setMenuId('')
    setSelected(null)
    setModal('edit')
  }

  function closeModal() {
    if (busy) return
    setModal('')
    setEditing(null)
    setFormError('')
  }

  function goAssign() {
    setMenuId('')
    setSelected(null)
    navigate('/dashboard/table-wise/waiters')
  }

  function openMerge(table) {
    setMenuId('')
    setSelected(null)
    setMoveTableId(table?.id || '')
    setMoveMode('merge')
  }

  function openTransfer(table) {
    setMenuId('')
    setSelected(null)
    setMoveTableId(table?.id || '')
    setMoveMode('transfer')
  }

  async function onMergeConfirm(payload) {
    if (moveBusy) return
    setMoveBusy(true)
    setError('')
    const { data, error: nextError } = await mergeTableSessions({
      restaurantId: restaurant.id,
      ...payload,
    })
    setMoveBusy(false)
    if (nextError || !data) {
      setError(nextError?.message || 'Unable to merge these tables. Please try again.')
      return
    }
    setMoveMode('')
    setMoveTableId('')
    setNotice('Tables merged into one session.')
    load()
  }

  async function onTransferConfirm(payload) {
    if (moveBusy) return
    setMoveBusy(true)
    setError('')
    const { data, error: nextError } = await transferTableSession({
      restaurantId: restaurant.id,
      ...payload,
    })
    setMoveBusy(false)
    if (nextError || !data) {
      setError(nextError?.message || 'Unable to transfer this table. Please try again.')
      return
    }
    setMoveMode('')
    setMoveTableId('')
    setNotice('Session transferred. The original session ID is unchanged.')
    load()
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
    setMenuId('')
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
    setMenuId('')
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
    setMenuId('')
    const ok = await copyText(tableUrl(restaurant, table))
    setNotice(ok ? `${tableHeading(table)} link copied.` : 'Could not copy the link.')
  }

  if (loading || (restaurant && !ready)) return <Spinner />
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
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Table-wise order</p>
          <h1 className="mt-1 font-display text-3xl">Floor / Tables</h1>
          <p className="mt-1 text-sm text-muted">Live occupancy from open sessions. QR active only controls the table QR.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard/table-wise/waiters">
            <Button variant="secondary">Manage Assignments</Button>
          </Link>
          <Button variant="secondary" onClick={() => openMerge(null)}>
            Merge Tables
          </Button>
          <Button variant="secondary" onClick={() => openTransfer(null)}>
            Transfer Table
          </Button>
          <Button onClick={openAdd}>
            <NavIcon name="plus" className="h-4 w-4" />
            Add Table
          </Button>
        </div>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon="tables" label="Total Tables" value={stats.total} hint={`${stats.out} out of service`} />
        <SummaryCard icon="orders" label="Occupied" value={stats.occupied + stats.billing} hint={stats.billing ? `${stats.billing} billing` : 'Open sessions'} />
        <SummaryCard icon="available" label="Available" value={stats.available} hint="QR active, no session" />
        <SummaryCard icon="collections" label="Running Amount" value={stats.running ? formatMoney(stats.running) : '—'} hint="Open session order totals" />
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((item) => (
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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {ASSIGN_FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAssignFilter(item.key)}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      assignFilter === item.key ? 'bg-ink text-white' : 'border border-line bg-white text-stone-600 hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className={`${inputClass} sm:w-40`}
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  aria-label="Sort tables"
                >
                  {SORTS.map((item) => (
                    <option key={item.key} value={item.key}>
                      Sort: {item.label}
                    </option>
                  ))}
                </select>
                <input
                  className={`${inputClass} lg:max-w-xs`}
                  placeholder="Search tables or waiters..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-10 text-center text-sm text-muted">
              No tables match this search or filter.
            </p>
          ) : (
            <div className="rounded-[1.8rem] border border-line bg-paper/70 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {visible.map((item) => {
                  const session = sessionForTable(sessions, item.id)
                  return (
                    <TableFloorCard
                      key={item.id}
                      table={item}
                      waiter={waiterByTable.get(item.id)}
                      session={session}
                      sessionTables={session ? tablesForSession(items, session) : []}
                      totals={session ? amountsBySession.get(session.id) : null}
                      menuOpen={menuId === item.id}
                      onOpen={setSelected}
                      onMenu={setMenuId}
                      onEdit={openEdit}
                      onAssign={goAssign}
                      onQr={(row) => {
                        setMenuId('')
                        setQrTable(row)
                      }}
                      onCopy={copyLink}
                      onToggle={toggleActive}
                      onRemove={remove}
                      onMerge={openMerge}
                      onTransfer={openTransfer}
                    />
                  )
                })}
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
        session={selectedSession}
        sessionTables={selectedSession ? tablesForSession(items, selectedSession) : []}
        totals={selectedSession ? amountsBySession.get(selectedSession.id) : null}
        restaurant={restaurant}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onQr={(item) => setQrTable(item)}
        onDownload={downloadQr}
        onPrint={printQr}
        onCopy={copyLink}
        onToggle={toggleActive}
        onRemove={remove}
        onMerge={openMerge}
        onTransfer={openTransfer}
        busy={qrBusy}
      />
      <MergeTablesDialog
        open={moveMode === 'merge'}
        restaurantId={restaurant.id}
        tables={items}
        sessions={sessions}
        orders={orders}
        startTableId={moveTableId}
        busy={moveBusy}
        onClose={() => {
          if (moveBusy) return
          setMoveMode('')
        }}
        onConfirm={onMergeConfirm}
      />
      <TransferTableDialog
        open={moveMode === 'transfer'}
        restaurantId={restaurant.id}
        tables={items}
        sessions={sessions}
        orders={orders}
        startTableId={moveTableId}
        busy={moveBusy}
        onClose={() => {
          if (moveBusy) return
          setMoveMode('')
        }}
        onConfirm={onTransferConfirm}
      />
    </div>
  )
}
