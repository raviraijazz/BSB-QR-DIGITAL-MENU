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
import { buildCartLine, clearCart, createSessionOrder, removeCartLine, setCartNote, setCartQuantity, upsertCartLine } from '../../services/waiterOrders'

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

function CartPanel({
  table,
  session,
  lines,
  notes,
  totals,
  busy,
  onNotes,
  onQty,
  onNote,
  onRemove,
  onClear,
  onPlace,
  onBack,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-line bg-card p-4">
      <div className="mb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Cart</p>
        <p className="mt-1 font-display text-xl leading-tight">{table ? tableHeading(table) : 'Table'}</p>
        <p className="text-xs text-muted">{session?.session_number || 'Session'} · new order only</p>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted">Add items from the menu.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {lines.map((line) => (
            <li key={line.key} className="space-y-2 rounded-2xl border border-line bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{line.item_name}</p>
                  <p className="text-sm text-muted">
                    {line.variant_name ? `${line.variant_name} · ` : ''}
                    {formatMoney(line.unit_price)} each
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <QtyControl value={line.quantity} onChange={(qty) => onQty(line.key, qty)} />
                  <p className="w-16 text-right text-sm font-medium tabular-nums">{formatMoney(line.unit_price * line.quantity)}</p>
                </div>
              </div>
              <input
                className={inputClass}
                placeholder="Item note for kitchen (optional)"
                value={line.notes || ''}
                onChange={(e) => onNote(line.key, e.target.value)}
              />
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => onRemove(line.key)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <Field label="Order notes" hint="Optional. Item notes print on the kitchen ticket; this note stays on the order.">
        <textarea className={`${inputClass} min-h-[72px]`} value={notes} onChange={(e) => onNotes(e.target.value)} />
      </Field>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-paper/70 px-4 py-3">
        <p className="text-sm text-muted">{totals.items} items</p>
        <p className="font-display text-xl">{formatMoney(totals.subtotal)}</p>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {onBack ? (
          <Button variant="secondary" onClick={onBack}>
            Continue ordering
          </Button>
        ) : null}
        <Button variant="secondary" disabled={lines.length === 0} onClick={onClear}>
          Clear cart
        </Button>
        <Button className="w-full" disabled={busy || lines.length === 0} onClick={onPlace}>
          {busy ? 'Sending...' : 'Place Order'}
        </Button>
      </div>
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
  const [categoryId, setCategoryId] = useState('all')
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
      setError(cats.error?.message || menu.error?.message ? 'Unable to load the menu. Please try again.' : '')
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
        .filter((category) => categoryId === 'all' || category.id === categoryId)
        .map((category) => ({
          ...category,
          items: (items || []).filter(
            (item) => item.category_id === category.id && itemMatches(item, category, query, filter),
          ),
        }))
        .filter((category) => category.items.length > 0),
    [categories, items, query, filter, categoryId],
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
    if (busy) return
    if (!session || !isOpenSession(session)) {
      setError('This table session is no longer active.')
      return
    }
    if (!table) {
      setError('You are not assigned to this table.')
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
    if (nextError || !data) {
      setBusy(false)
      setError(nextError?.message || 'Unable to place order. Please try again.')
      return
    }
    setLines(clearCart())
    setNotes('')
    navigate(`/waiter/sessions/${session.id}`, {
      replace: true,
      state: { notice: data.order_number ? `Order placed. Order #${data.order_number}.` : 'Order placed' },
    })
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
  const cartProps = {
    table,
    session,
    lines,
    notes,
    totals,
    busy,
    onNotes: setNotes,
    onQty: (key, qty) => setLines((current) => setCartQuantity(current, key, qty)),
    onNote: (key, value) => setLines((current) => setCartNote(current, key, value)),
    onRemove: (key) => setLines((current) => removeCartLine(current, key)),
    onClear: () => setLines(clearCart()),
    onPlace: sendOrder,
  }

  return (
    <div className={`space-y-5 ${open ? 'lg:pb-0 pb-28' : ''}`}>
      <div>
        <Link
          to={`/waiter/sessions/${session.id}`}
          className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink"
        >
          {table ? tableHeading(table) : 'Session'} · {session.session_number}
        </Link>
        <h1 className="mt-1 font-display text-3xl">{step === 'review' ? 'Review Order' : 'Add Order'}</h1>
        <p className="mt-1 text-sm text-muted">
          {restaurant?.name || 'Restaurant'} · {waiter.full_name} · new order only. Submitted orders stay unchanged.
        </p>
      </div>

      <Alert>{error}</Alert>

      {!open ? (
        <EmptyState title="Session closed" body="This table session is no longer active." actionTo="/waiter" actionLabel="My Tables" />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
          <div className={step === 'review' ? 'hidden lg:block' : ''}>
            <div className="space-y-2">
              <input
                className={inputClass}
                type="search"
                placeholder="Search menu items..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter menu items">
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
              {categories.length > 0 ? (
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Menu categories">
                  <button
                    type="button"
                    onClick={() => setCategoryId('all')}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
                      categoryId === 'all' ? 'bg-ink text-[#f5ead8]' : 'bg-paper text-muted'
                    }`}
                  >
                    All categories
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setCategoryId(category.id)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
                        categoryId === category.id ? 'bg-ink text-[#f5ead8]' : 'bg-paper text-muted'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {grouped.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No menu items" body="Ask the owner to add categories and items, or clear search." />
              </div>
            ) : (
              <div className="mt-5 space-y-6">
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
          </div>

          <aside className={`lg:sticky lg:top-4 ${step === 'menu' ? 'hidden lg:block' : ''}`}>
            {lines.length === 0 && step === 'review' ? (
              <EmptyState title="Cart is empty" body="Add items from the menu first." actionLabel="Back to menu" onAction={() => setStep('menu')} />
            ) : (
              <CartPanel {...cartProps} onBack={step === 'review' ? () => setStep('menu') : undefined} />
            )}
          </aside>
        </div>
      )}

      {open && step === 'menu' ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
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
