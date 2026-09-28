import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import Spinner from '../../../components/Spinner'
import {
  elapsedLabel,
  firstRelated,
  formatClock,
  formatQty,
  kotStatusLabel,
  kotTypeLabel,
} from '../../../lib/orderCart'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { tableHeading } from '../../../lib/tableToken'
import { listRestaurantKots, nextKotStatus, updateKotStatus } from '../../../services/kots'
import { listTables } from '../../../services/tables'

const COLUMNS = [
  { id: 'new', label: 'NEW', hint: 'Incoming tickets', accent: 'border-l-sky-400', pill: 'bg-sky-100 text-sky-900' },
  { id: 'preparing', label: 'PREPARING', hint: 'In kitchen', accent: 'border-l-orange-400', pill: 'bg-orange-100 text-orange-900' },
  { id: 'ready', label: 'READY', hint: 'Ready to serve', accent: 'border-l-forest', pill: 'bg-forest/10 text-forest' },
]

function kotOrder(kot) {
  return firstRelated(kot?.orders)
}

function kotWaiter(kot) {
  return firstRelated(kotOrder(kot)?.waiters)
}

function kotSession(kot) {
  return firstRelated(kotOrder(kot)?.table_sessions)
}

function actionLabel(status) {
  if (status === 'new') return 'Start Preparing'
  if (status === 'preparing') return 'Mark Ready'
  return ''
}

function KotCard({ kot, table, waiter, order, working, onStatus }) {
  const items = kot.kot_items || []
  const next = nextKotStatus(kot.status)
  const column = COLUMNS.find((row) => row.id === kot.status) || COLUMNS[0]
  const waiterLabel = waiter?.full_name && waiter?.waiter_id
    ? `${waiter.full_name} · ${waiter.waiter_id}`
    : waiter?.waiter_id || waiter?.full_name || 'Waiter'

  return (
    <article className={`flex min-h-[240px] flex-col rounded-2xl border border-line border-l-4 bg-card p-4 shadow-sm ${column.accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none">KOT #{kot.kot_number}</p>
          <p className="mt-2 font-display text-xl leading-tight">{table ? tableHeading(table) : 'Table'}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${column.pill}`}>
            {kotStatusLabel(kot.status)}
          </span>
          <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
            {kotTypeLabel(kot.kot_type)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        {waiterLabel}
        {order?.order_number ? ` · Order #${order.order_number}` : ''}
      </p>
      <p className="text-xs text-muted">
        {formatClock(kot.created_at)}
        {elapsedLabel(kot.created_at) ? ` · ${elapsedLabel(kot.created_at)}` : ''}
        {` · ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span className="min-w-0">
              <span className="font-medium">{item.item_name}</span>
              {item.notes ? <span className="mt-0.5 block text-xs font-medium text-accent-dark">Special: {item.notes}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted">×{formatQty(item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">
        {next ? (
          <Button className="w-full" disabled={working} onClick={() => onStatus(kot, next)}>
            {working ? 'Updating...' : actionLabel(kot.status)}
          </Button>
        ) : (
          <p className="rounded-xl bg-forest/10 px-3 py-2 text-center text-sm font-medium text-forest">Ready</p>
        )}
      </div>
    </article>
  )
}

export default function Kitchen() {
  const { restaurant, loading } = useOutletContext()
  const [kots, setKots] = useState([])
  const [tables, setTables] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [workingId, setWorkingId] = useState('')

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
    setBusy(false)
  }

  useEffect(() => {
    load()
    if (!restaurantId) return undefined
    const timer = window.setInterval(() => load(true), 8000)
    return () => window.clearInterval(timer)
  }, [restaurantId])

  const tableById = useMemo(() => Object.fromEntries((tables || []).map((table) => [table.id, table])), [tables])

  const grouped = useMemo(() => {
    const next = { new: [], preparing: [], ready: [] }
    for (const kot of kots || []) {
      if (next[kot.status]) next[kot.status].push(kot)
    }
    return next
  }, [kots])

  function tableFor(kot) {
    const order = kotOrder(kot)
    const session = kotSession(kot)
    return tableById[order?.source_table_id] || tableById[session?.primary_table_id] || null
  }

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Kitchen / KOT</h1>
          <p className="mt-1 text-sm text-muted">{restaurant.name} · one ticket per order. Add-ons never change the first KOT.</p>
        </div>
        <Button variant="secondary" onClick={() => load()}>
          Refresh
        </Button>
      </div>

      <Alert>{error}</Alert>

      {empty ? (
        <EmptyState
          title="No kitchen tickets yet"
          body="KOTs appear here after a waiter places an order. Each Place Order creates one ticket with only that order's items."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {COLUMNS.map((column) => {
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
                        table={tableFor(kot)}
                        waiter={kotWaiter(kot)}
                        order={kotOrder(kot)}
                        working={workingId === kot.id}
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
    </div>
  )
}
