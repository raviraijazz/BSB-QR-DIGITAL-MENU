import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import FoodTypeMark from '../../components/FoodTypeMark'
import Spinner from '../../components/Spinner'
import { cartTotals, formatMoney, isOpenSession, itemIsSoldOut, orderableVariants } from '../../lib/orderCart'
import { tableHeading } from '../../lib/tableToken'
import { normalizeFoodType } from '../../lib/foodType'
import { listCategories } from '../../services/categories'
import { listMenuItems } from '../../services/menuItems'
import { getSession, tableForSession, waiterOwnsSession } from '../../services/tableSessions'
import { buildCartLine, createSessionOrder, setCartNote, setCartQuantity, upsertCartLine } from '../../services/waiterOrders'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'veg', label: 'Veg' },
  { id: 'non_veg', label: 'Non-Veg' },
]

function itemMatches(item, category, query, filter) {
  const foodType = normalizeFoodType(item.food_type)
  if (filter === 'veg' && foodType !== 'veg') return false
  if (filter === 'non_veg' && foodType !== 'non_veg') return false
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return true
  const hay = `${item.name || ''} ${item.description || ''} ${category?.name || ''}`.toLowerCase()
  return hay.includes(needle)
}

function QtyControl({ value, onChange }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-white">
      <button type="button" className="grid h-8 w-8 place-items-center text-lg leading-none" onClick={() => onChange(value - 1)} aria-label="Decrease">
        −
      </button>
      <span className="min-w-[1.5rem] text-center text-sm tabular-nums">{value}</span>
      <button type="button" className="grid h-8 w-8 place-items-center text-lg leading-none" onClick={() => onChange(value + 1)} aria-label="Increase">
        +
      </button>
    </div>
  )
}

function MenuItemRow({ item, onAdd }) {
  const soldOut = itemIsSoldOut(item)
  const variants = orderableVariants(item)
  const named = variants.filter((row) => row.name)
  const [picked, setPicked] = useState(named[0]?.name || '')

  useEffect(() => {
    if (named.length && !named.some((row) => row.name === picked)) setPicked(named[0].name)
  }, [item.id])

  return (
    <li className={`rounded-2xl border border-line bg-card p-3 ${soldOut ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium leading-snug">
            <FoodTypeMark value={item.food_type} />
            <span className="min-w-0">{item.name}</span>
          </p>
          {item.description ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{item.description}</p> : null}
          {named.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {named.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  disabled={soldOut}
                  onClick={() => setPicked(row.name)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    picked === row.name ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted'
                  }`}
                >
                  {row.name} {formatMoney(row.price)}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium tabular-nums">{formatMoney(variants[0]?.price ?? item.price)}</p>
          )}
          {soldOut ? (
            <span className="mt-2 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-700">
              Sold Out
            </span>
          ) : null}
        </div>
        <Button
          variant="secondary"
          className="!px-3 !py-1.5 shrink-0"
          disabled={soldOut || variants.length === 0}
          onClick={() => onAdd(item, named.length ? picked : '')}
        >
          Add
        </Button>
      </div>
    </li>
  )
}

export default function WaiterOrder() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { waiter, restaurant, tables } = useOutletContext()
  const [session, setSession] = useState(null)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [lines, setLines] = useState([])
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [step, setStep] = useState('menu')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const table = useMemo(() => tableForSession(tables, session), [tables, session])

  useEffect(() => {
    let active = true
    async function load() {
      if (!restaurant?.id || !sessionId) return
      setLoading(true)
      const [{ data: nextSession, error: sessionError }, cats, menu] = await Promise.all([
        getSession(sessionId, restaurant.id),
        listCategories(restaurant.id),
        listMenuItems(restaurant.id),
      ])
      if (!active) return
      if (sessionError || !nextSession || !waiterOwnsSession(tables, nextSession)) {
        setSession(null)
        setError(sessionError?.message || 'Session not found or not assigned to you.')
        setLoading(false)
        return
      }
      setSession(nextSession)
      setCategories(cats.data ?? [])
      setItems(menu.data ?? [])
      setError(cats.error?.message || menu.error?.message || '')
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [restaurant?.id, sessionId, tables])

  const grouped = useMemo(
    () =>
      (categories || [])
        .map((category) => ({
          ...category,
          items: (items || []).filter(
            (item) => item.category_id === category.id && itemMatches(item, category, query, filter),
          ),
        }))
        .filter((category) => category.items.length > 0),
    [categories, items, query, filter],
  )

  const totals = cartTotals(lines)

  function addItem(item, variantName) {
    const { line, error: nextError } = buildCartLine(item, variantName)
    if (nextError || !line) {
      setError(nextError?.message || 'Could not add item')
      return
    }
    setError('')
    setLines((current) => upsertCartLine(current, line))
  }

  async function sendOrder() {
    if (!session || !isOpenSession(session)) {
      setError('This session is no longer open for orders.')
      return
    }
    if (!table) {
      setError('This table is not assigned to you.')
      return
    }
    setBusy(true)
    setError('')
    const { data, error: nextError } = await createSessionOrder({
      restaurantId: restaurant.id,
      session,
      waiter,
      table,
      lines,
      notes,
    })
    setBusy(false)
    if (nextError || !data) {
      setError(nextError?.message || 'Could not send order')
      return
    }
    navigate(`/waiter/sessions/${session.id}`, { replace: true })
  }

  if (loading) return <Spinner />
  if (!session) {
    return (
      <EmptyState
        title="Session not available"
        body={error || 'Open one of your assigned tables first.'}
        actionTo="/waiter"
        actionLabel="My Tables"
      />
    )
  }

  const open = isOpenSession(session)

  return (
    <div className="space-y-5 pb-28">
      <div>
        <Link
          to={`/waiter/sessions/${session.id}`}
          className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink"
        >
          {table ? tableHeading(table) : 'Session'} · {session.session_number}
        </Link>
        <h1 className="mt-1 font-display text-3xl">{step === 'review' ? 'Review Order' : 'Add Order'}</h1>
        <p className="mt-1 text-sm text-muted">New order for this session. Previous orders are not changed.</p>
      </div>

      <Alert>{error}</Alert>

      {!open ? (
        <EmptyState title="Session closed" body="This table session is no longer open for orders." actionTo="/waiter" actionLabel="My Tables" />
      ) : step === 'menu' ? (
        <>
          <div className="space-y-2">
            <input
              className={inputClass}
              type="search"
              placeholder="Search menu items..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter menu items">
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
          </div>

          {grouped.length === 0 ? (
            <EmptyState title="No menu items" body="Ask the owner to add categories and items, or clear search." />
          ) : (
            <div className="space-y-6">
              {grouped.map((category) => (
                <section key={category.id}>
                  <h2 className="mb-2 font-display text-xl">{category.name}</h2>
                  <ul className="space-y-2">
                    {category.items.map((item) => (
                      <MenuItemRow key={item.id} item={item} onAdd={addItem} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {lines.length === 0 ? (
            <EmptyState title="Cart is empty" body="Add items from the menu first." actionLabel="Back to menu" onAction={() => setStep('menu')} />
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li key={line.key} className="space-y-2 rounded-2xl border border-line bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{line.item_name}</p>
                      <p className="text-sm text-muted">{formatMoney(line.unit_price)} each</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <QtyControl value={line.quantity} onChange={(qty) => setLines((current) => setCartQuantity(current, line.key, qty))} />
                      <p className="w-16 text-right text-sm font-medium tabular-nums">{formatMoney(line.unit_price * line.quantity)}</p>
                    </div>
                  </div>
                  <input
                    className={inputClass}
                    placeholder="Item note for kitchen (optional)"
                    value={line.notes || ''}
                    onChange={(e) => setLines((current) => setCartNote(current, line.key, e.target.value))}
                  />
                </li>
              ))}
            </ul>
          )}
          <Field label="Order notes" hint="Optional. Item notes print on the kitchen ticket; this note stays on the order.">
            <textarea className={`${inputClass} min-h-[88px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-sm text-muted">{totals.items} items</p>
            <p className="font-display text-xl">{formatMoney(totals.subtotal)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep('menu')}>
              Back to menu
            </Button>
            <Button disabled={busy || lines.length === 0} onClick={sendOrder}>
              {busy ? 'Sending...' : 'Send Order'}
            </Button>
          </div>
        </div>
      )}

      {open && step === 'menu' ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm">
              {totals.items} items · <span className="font-medium">{formatMoney(totals.subtotal)}</span>
            </p>
            <Button disabled={lines.length === 0} onClick={() => setStep('review')}>
              Review Order
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
