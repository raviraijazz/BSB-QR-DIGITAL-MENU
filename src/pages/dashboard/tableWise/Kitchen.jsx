import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import EmptyState from '../../../components/EmptyState'
import Spinner from '../../../components/Spinner'
import { printKot } from '../../../lib/kotPrint'
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
import { listRestaurantKots, markKotPrinted, updateKotStatus } from '../../../services/kots'
import { listTables } from '../../../services/tables'

const TABS = [
  { id: 'new', label: 'NEW' },
  { id: 'preparing', label: 'PREPARING' },
  { id: 'ready', label: 'READY' },
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

function nextStatus(status) {
  if (status === 'new') return 'preparing'
  if (status === 'preparing') return 'ready'
  return null
}

function actionLabel(status) {
  if (status === 'new') return 'Start'
  if (status === 'preparing') return 'Mark Ready'
  return ''
}

export default function Kitchen() {
  const { restaurant, loading } = useOutletContext()
  const [kots, setKots] = useState([])
  const [tables, setTables] = useState([])
  const [tab, setTab] = useState('new')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [workingId, setWorkingId] = useState('')

  async function load() {
    if (!restaurant?.id) {
      setKots([])
      setTables([])
      setBusy(false)
      return
    }
    setBusy(true)
    const [nextKots, nextTables] = await Promise.all([listRestaurantKots(restaurant.id), listTables(restaurant.id)])
    setKots(nextKots.data ?? [])
    setTables(nextTables.data ?? [])
    setError(nextKots.error?.message || nextTables.error?.message || '')
    setBusy(false)
  }

  useEffect(() => {
    load()
  }, [restaurant?.id])

  const tableById = useMemo(() => Object.fromEntries((tables || []).map((table) => [table.id, table])), [tables])

  const counts = useMemo(() => {
    const next = { new: 0, preparing: 0, ready: 0 }
    for (const kot of kots || []) {
      if (next[kot.status] != null) next[kot.status] += 1
    }
    return next
  }, [kots])

  const visible = useMemo(() => (kots || []).filter((kot) => kot.status === tab), [kots, tab])

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
      setError(nextError?.message || 'Could not update kitchen status')
      return
    }
    setKots((current) => current.map((row) => (row.id === kot.id ? { ...row, ...data } : row)))
  }

  async function onPrint(kot) {
    printKot({
      restaurant,
      kot,
      table: tableFor(kot),
      waiter: kotWaiter(kot),
      order: kotOrder(kot),
    })
    const { data } = await markKotPrinted(kot.id, restaurant.id)
    if (data) setKots((current) => current.map((row) => (row.id === kot.id ? { ...row, printed_at: data.printed_at } : row)))
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Kitchen / KOT</h1>
          <p className="mt-1 text-sm text-muted">{restaurant.name} · tickets from waiter orders. No billing.</p>
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <Alert>{error}</Alert>

      <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Kitchen status">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
              tab === option.id ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted'
            }`}
          >
            {option.label} {counts[option.id] || 0}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={`No ${kotStatusLabel(tab).toLowerCase()} tickets`}
          body="KOTs appear here after a waiter sends an order. Add-on orders create a new ticket with only the new items."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((kot) => {
            const order = kotOrder(kot)
            const waiter = kotWaiter(kot)
            const table = tableFor(kot)
            const items = kot.kot_items || []
            const next = nextStatus(kot.status)
            return (
              <article key={kot.id} className="flex min-h-[260px] flex-col rounded-2xl border border-line bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl leading-none">KOT #{kot.kot_number}</p>
                    <p className="mt-2 font-display text-xl leading-tight">{table ? tableHeading(table) : 'Table'}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-forest">
                      {kotTypeLabel(kot.kot_type)}
                    </span>
                    <p className="mt-2 text-xs text-muted">{elapsedLabel(kot.created_at) || formatClock(kot.created_at)}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {waiter?.waiter_id || 'Waiter'}
                  {order?.order_number ? ` · Order #${order.order_number}` : ''}
                  {` · ${formatClock(kot.created_at)}`}
                </p>
                <ul className="mt-3 space-y-1 text-sm">
                  {items.map((item) => (
                    <li key={item.id}>
                      <span className="font-medium">
                        {formatQty(item.quantity)} × {item.item_name}
                      </span>
                      {item.notes ? <span className="block text-xs text-muted">{item.notes}</span> : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {next ? (
                    <Button className="flex-1" disabled={workingId === kot.id} onClick={() => onStatus(kot, next)}>
                      {workingId === kot.id ? 'Updating...' : actionLabel(kot.status)}
                    </Button>
                  ) : (
                    <p className="flex-1 self-center text-sm text-muted">{kotStatusLabel(kot.status)}</p>
                  )}
                  <Button variant="secondary" onClick={() => onPrint(kot)}>
                    Print
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
