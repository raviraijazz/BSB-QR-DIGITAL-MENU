import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import { inputClass } from '../../../components/Field'
import NavIcon from '../../../components/NavIcon'
import Spinner from '../../../components/Spinner'
import {
  elapsedLabel,
  elapsedMinutes,
  firstRelated,
  formatClock,
  formatQty,
  kotAgeTone,
  kotStatusLabel,
  kotTypeLabel,
} from '../../../lib/orderCart'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { sessionTablesLabel, tableHeading } from '../../../lib/tableToken'
import { listRestaurantKots, nextKotStatus, updateKotStatus } from '../../../services/kots'
import { tablesForSession } from '../../../services/tableMoves'
import { listTables } from '../../../services/tables'

const COLUMNS = [
  { id: 'new', label: 'NEW', hint: 'Incoming tickets', accent: 'border-l-sky-400', pill: 'bg-sky-100 text-sky-900' },
  { id: 'preparing', label: 'PREPARING', hint: 'In kitchen', accent: 'border-l-orange-400', pill: 'bg-orange-100 text-orange-900' },
  { id: 'ready', label: 'READY', hint: 'Ready to serve', accent: 'border-l-forest', pill: 'bg-forest/10 text-forest' },
]

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'add_ons', label: 'Add-ons' },
]

const AGE = {
  fresh: { card: '', timer: 'text-ink' },
  waiting: { card: 'bg-amber-50/55', timer: 'text-amber-800' },
  delayed: { card: 'bg-rose-50/70', timer: 'text-rose-800' },
  ready: { card: '', timer: 'text-forest' },
}

function kotOrder(kot) {
  return firstRelated(kot?.orders)
}

function kotWaiter(kot) {
  return firstRelated(kotOrder(kot)?.waiters)
}

function kotSession(kot) {
  return firstRelated(kotOrder(kot)?.table_sessions)
}

function waiterLabel(waiter) {
  if (waiter?.full_name && waiter?.waiter_id) return `${waiter.full_name} · ${waiter.waiter_id}`
  return waiter?.waiter_id || waiter?.full_name || 'Waiter'
}

function actionLabel(status) {
  if (status === 'new') return 'Start Preparing'
  if (status === 'preparing') return 'Mark Ready'
  return ''
}

function cardAccent(kot, minutes) {
  const tone = kotAgeTone(minutes, kot.status)
  if (tone === 'delayed') return 'border-l-rose-400'
  if (tone === 'waiting') return 'border-l-amber-400'
  return (COLUMNS.find((row) => row.id === kot.status) || COLUMNS[0]).accent
}

function ticketQuery(kot, tableLabel, waiter) {
  const items = (kot?.kot_items || []).map((item) => item.item_name).join(' ')
  return [
    kot?.kot_number,
    tableLabel,
    waiter?.full_name,
    waiter?.waiter_id,
    kotOrder(kot)?.order_number,
    items,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function kotTableLabel(kot, tables) {
  const list = tables || []
  const order = kotOrder(kot)
  const session = kotSession(kot)
  const group = tablesForSession(list, session)
  if (group.length > 1) return sessionTablesLabel(group, { compact: true })
  const table = list.find((item) => item.id === order?.source_table_id) || list.find((item) => item.id === session?.primary_table_id) || group[0]
  return table ? tableHeading(table) : 'Table'
}

function KotCard({ kot, tableLabel, waiter, order, working, now, onOpen, onStatus }) {
  const items = kot.kot_items || []
  const preview = items.slice(0, 3)
  const extra = items.length - preview.length
  const next = nextKotStatus(kot.status)
  const column = COLUMNS.find((row) => row.id === kot.status) || COLUMNS[0]
  const minutes = elapsedMinutes(kot.created_at, now)
  const tone = kotAgeTone(minutes, kot.status)
  const age = AGE[tone] || AGE.fresh

  return (
    <article
      className={`flex min-h-[220px] cursor-pointer flex-col rounded-2xl border border-line border-l-4 bg-card p-4 shadow-sm ${cardAccent(kot, minutes)} ${age.card}`}
      onClick={() => onOpen(kot)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none">KOT #{kot.kot_number}</p>
          <p className="mt-2 font-display text-xl leading-tight">{tableLabel || 'Table'}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${column.pill}`}>
            {kotStatusLabel(kot.status)}
          </span>
          {kot.kot_type === 'add_on' ? (
            <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[11px] font-medium text-ink">
              {kotTypeLabel(kot.kot_type)}
            </span>
          ) : (
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
              {kotTypeLabel(kot.kot_type)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={`font-display text-2xl tabular-nums leading-none ${age.timer}`}>
          {elapsedLabel(kot.created_at, now) || 'Just now'}
        </p>
        <p className="text-xs text-muted">{formatClock(kot.created_at)}</p>
      </div>

      <p className="mt-2 text-sm text-muted">
        {waiterLabel(waiter)}
        {order?.order_number ? ` · Order #${order.order_number}` : ''}
        {` · ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
      </p>

      <ul className="mt-3 space-y-1.5 text-sm">
        {preview.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.item_name}</span>
              {item.notes ? <span className="mt-0.5 block truncate text-xs font-medium text-accent-dark">Special: {item.notes}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted">×{formatQty(item.quantity)}</span>
          </li>
        ))}
      </ul>
      {extra > 0 ? <p className="mt-1 text-xs text-muted">+{extra} more</p> : null}

      <div className="mt-auto pt-4">
        {next ? (
          <Button
            className="w-full"
            disabled={working}
            onClick={(event) => {
              event.stopPropagation()
              onStatus(kot, next)
            }}
          >
            {working ? 'Updating...' : actionLabel(kot.status)}
          </Button>
        ) : (
          <p className="rounded-xl bg-forest/10 px-3 py-2 text-center text-sm font-medium text-forest">Ready</p>
        )}
      </div>
    </article>
  )
}

function TicketDrawer({ open, kot, tableLabel, waiter, order, session, working, now, onClose, onStatus }) {
  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !kot) return null

  const items = kot.kot_items || []
  const next = nextKotStatus(kot.status)
  const column = COLUMNS.find((row) => row.id === kot.status) || COLUMNS[0]
  const minutes = elapsedMinutes(kot.created_at, now)
  const tone = kotAgeTone(minutes, kot.status)
  const age = AGE[tone] || AGE.fresh

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close ticket" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Kitchen ticket</p>
            <h2 className="mt-1 font-display text-2xl">KOT #{kot.kot_number}</h2>
            <p className="mt-1 text-sm text-muted">{tableLabel || 'Table'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${column.pill}`}>
                {kotStatusLabel(kot.status)}
              </span>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
                {kotTypeLabel(kot.kot_type)}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-line">
            <NavIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Elapsed</p>
            <p className={`mt-1 font-display text-3xl tabular-nums leading-none ${age.timer}`}>
              {elapsedLabel(kot.created_at, now) || 'Just now'}
            </p>
            <p className="mt-1 text-xs text-muted">Received {formatClock(kot.created_at)}</p>
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Waiter</p>
            <p className="mt-1 font-medium">{waiterLabel(waiter)}</p>
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Session</p>
            <p className="mt-1 font-medium">{session?.session_number || 'Session'}</p>
            {order?.order_number ? <p className="mt-1 text-xs text-muted">Order #{order.order_number}</p> : null}
          </div>
          <div className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Items</p>
            {items.length ? (
              <ul className="mt-2 space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{item.item_name}</span>
                      <span className="shrink-0 tabular-nums text-muted">×{formatQty(item.quantity)}</span>
                    </div>
                    {item.notes ? <p className="mt-0.5 text-xs font-medium text-accent-dark">Special: {item.notes}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">No line items</p>
            )}
            {order?.notes ? <p className="mt-3 text-xs text-muted">Order note: {order.notes}</p> : null}
          </div>
        </div>

        <div className="mt-6">
          {next ? (
            <Button className="w-full" disabled={working} onClick={() => onStatus(kot, next)}>
              {working ? 'Updating...' : actionLabel(kot.status)}
            </Button>
          ) : (
            <p className="rounded-xl bg-forest/10 px-3 py-2 text-center text-sm font-medium text-forest">Ready to serve</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Kitchen() {
  const { restaurant, loading } = useOutletContext()
  const [kots, setKots] = useState([])
  const [tables, setTables] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [refreshedAt, setRefreshedAt] = useState(null)

  const restaurantId = restaurant?.id

  async function load(silent = false) {
    if (!restaurantId) {
      setKots([])
      setTables([])
      setBusy(false)
      return
    }
    if (!silent) setBusy(true)
    const [nextKots, nextTables] = await Promise.all([listRestaurantKots(restaurantId), listTables(restaurantId)])
    setKots(nextKots.data ?? [])
    setTables(nextTables.data ?? [])
    setError(nextKots.error?.message || nextTables.error?.message || '')
    setRefreshedAt(Date.now())
    setBusy(false)
  }

  useEffect(() => {
    load()
    if (!restaurantId) return undefined
    const timer = window.setInterval(() => load(true), 8000)
    return () => window.clearInterval(timer)
  }, [restaurantId])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  function labelFor(kot) {
    return kotTableLabel(kot, tables)
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (kots || []).filter((kot) => {
      if (filter === 'add_ons' && kot.kot_type !== 'add_on') return false
      if (filter !== 'all' && filter !== 'add_ons' && kot.status !== filter) return false
      if (!needle) return true
      return ticketQuery(kot, labelFor(kot), kotWaiter(kot)).includes(needle)
    })
  }, [kots, filter, query, tables])

  const grouped = useMemo(() => {
    const next = { new: [], preparing: [], ready: [] }
    for (const kot of visible) {
      if (next[kot.status]) next[kot.status].push(kot)
    }
    return next
  }, [visible])

  const metrics = useMemo(() => {
    const rows = kots || []
    const delayed = rows.filter((kot) => kotAgeTone(elapsedMinutes(kot.created_at, now), kot.status) === 'delayed').length
    return [
      { id: 'live', label: 'Live tickets', value: rows.length },
      { id: 'new', label: 'New', value: rows.filter((kot) => kot.status === 'new').length },
      { id: 'preparing', label: 'Preparing', value: rows.filter((kot) => kot.status === 'preparing').length },
      { id: 'ready', label: 'Ready', value: rows.filter((kot) => kot.status === 'ready').length },
      { id: 'delayed', label: 'Delayed', value: delayed },
    ]
  }, [kots, now])

  const selected = useMemo(() => (kots || []).find((kot) => kot.id === selectedId) || null, [kots, selectedId])

  async function onStatus(kot, status) {
    setWorkingId(kot.id)
    setError('')
    const { data, error: nextError } = await updateKotStatus(kot.id, restaurant.id, status)
    setWorkingId('')
    if (nextError || !data) {
      setError(nextError?.message || 'Unable to update kitchen status. Please try again.')
      load(true)
      return
    }
    setKots((current) => current.map((row) => (row.id === kot.id ? { ...row, ...data } : row)))
  }

  if (loading || busy) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Kitchen tickets are scoped to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  const empty = !kots.length
  const noMatch = !empty && !visible.length
  const shownColumns =
    filter === 'new' || filter === 'preparing' || filter === 'ready'
      ? COLUMNS.filter((column) => column.id === filter)
      : COLUMNS

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Kitchen / KOT</h1>
          <p className="mt-1 text-sm text-muted">
            {restaurant.name}
            {refreshedAt ? ` · updated ${formatClock(refreshedAt)}` : ''}
            {' · one ticket per order'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.id} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{metric.label}</p>
            <p className="mt-1 font-display text-3xl leading-none tabular-nums">{metric.value}</p>
          </div>
        ))}
      </div>

      <Alert>{error}</Alert>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter tickets">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
                filter === option.id ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          className={`${inputClass} lg:max-w-xs`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search table or KOT #"
        />
      </div>

      {empty ? (
        <EmptyState
          title="No kitchen tickets yet"
          body="KOTs appear here after a waiter places an order. Each Place Order creates one ticket with only that order's items."
        />
      ) : noMatch ? (
        <EmptyState title="No matching tickets" body="Try another filter or clear the search." />
      ) : (
        <div className={`grid gap-4 ${shownColumns.length === 1 ? 'md:grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
          {shownColumns.map((column) => {
            const rows = grouped[column.id] || []
            return (
              <section key={column.id} className="min-w-0">
                <div className="mb-3 flex items-end justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl leading-none">{column.label}</h2>
                    <p className="mt-1 text-xs text-muted">{column.hint}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${column.pill}`}>{rows.length}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-8 text-center text-sm text-muted">
                    No {kotStatusLabel(column.id).toLowerCase()} tickets
                  </p>
                ) : (
                  <div className="space-y-3">
                    {rows.map((kot) => (
                      <KotCard
                        key={kot.id}
                        kot={kot}
                        tableLabel={labelFor(kot)}
                        waiter={kotWaiter(kot)}
                        order={kotOrder(kot)}
                        working={workingId === kot.id}
                        now={now}
                        onOpen={(ticket) => setSelectedId(ticket.id)}
                        onStatus={onStatus}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <TicketDrawer
        open={Boolean(selected)}
        kot={selected}
        tableLabel={selected ? labelFor(selected) : ''}
        waiter={selected ? kotWaiter(selected) : null}
        order={selected ? kotOrder(selected) : null}
        session={selected ? kotSession(selected) : null}
        working={selected ? workingId === selected.id : false}
        now={now}
        onClose={() => setSelectedId('')}
        onStatus={onStatus}
      />
    </div>
  )
}
