import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import FoodTypeMark from '../components/FoodTypeMark'
import { menuVariantRows } from '../lib/pricing'
import { getPublicRestaurant } from '../services/restaurants'
import { getPublicMenu } from '../services/menuItems'

function restaurantInitial(name) {
  const t = String(name || '').trim()
  return t ? t[0].toUpperCase() : 'R'
}

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase()
}

function itemMatches(item, category, query) {
  if (!query) return true
  const name = String(item.name || '').toLowerCase()
  const description = String(item.description || '').toLowerCase()
  const categoryName = String(category.name || '').toLowerCase()
  return name.includes(query) || description.includes(query) || categoryName.includes(query)
}

function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-paper" aria-busy="true" aria-live="polite">
      <span className="sr-only">Opening menu...</span>
      <header className="border-b border-line bg-card px-4 py-5">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2.5">
          <div className="h-14 w-14 animate-pulse rounded-2xl bg-line" />
          <div className="h-6 w-44 animate-pulse rounded-md bg-line" />
          <div className="h-3 w-32 animate-pulse rounded bg-line" />
        </div>
      </header>
      <div className="sticky top-0 z-10 border-b border-line bg-card/95 px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-[4.5rem] shrink-0 animate-pulse rounded-full bg-line" />
          ))}
        </div>
      </div>
      <main className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <div className="mb-4 h-5 w-24 animate-pulse rounded bg-line" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-line bg-card p-3">
            <div className="h-[4.5rem] w-[4.5rem] shrink-0 animate-pulse rounded-xl bg-line sm:h-20 sm:w-20" />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
              <div className="h-3 w-full animate-pulse rounded bg-line" />
              <div className="h-3 w-14 animate-pulse rounded bg-line" />
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}

function RestaurantMark({ restaurant }) {
  if (restaurant.logo_url) {
    return (
      <img
        src={restaurant.logo_url}
        alt=""
        className="h-14 w-14 rounded-2xl object-cover shadow-sm ring-1 ring-line sm:h-16 sm:w-16"
      />
    )
  }
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest text-lg font-medium text-[#f5ead8] shadow-sm sm:h-16 sm:w-16 sm:text-xl"
      aria-hidden="true"
    >
      {restaurantInitial(restaurant.name)}
    </div>
  )
}

function ItemCard({ item }) {
  const rows = menuVariantRows(item)
  const single = rows.length === 1 && !rows[0].name
  const available = item.is_available !== false

  return (
    <li
      className={`rounded-2xl border border-line bg-card p-3 shadow-[0_1px_2px_rgba(28,25,23,0.04)] sm:p-3.5 ${
        available ? '' : 'opacity-60'
      }`}
    >
      <div className="flex gap-3 sm:gap-4">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex min-w-0 items-center gap-1.5 text-[0.95rem] font-medium leading-snug text-ink sm:text-base">
              <FoodTypeMark value={item.food_type} />
              <span className="min-w-0">{item.name}</span>
            </h3>
            {single ? (
              <p className="shrink-0 text-sm font-medium tabular-nums text-ink">{rows[0].label}</p>
            ) : null}
          </div>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{item.description}</p>
          ) : null}
          {!single && rows.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {rows.map((row) => (
                <li
                  key={`${item.id}-${row.name}`}
                  className={`flex items-baseline justify-between gap-3 text-sm ${
                    row.is_available ? 'text-ink' : 'text-muted'
                  }`}
                >
                  <span className={row.is_available ? '' : 'opacity-80'}>{row.name}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className={row.is_available ? 'font-medium' : 'line-through opacity-70'}>{row.label}</span>
                    {!row.is_available ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide no-underline">Sold out</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {!available ? (
            <span className="mt-2 inline-block rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-700">
              Sold Out
            </span>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function MenuSearch({ value, onChange, onClear }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-2.5">
      <label htmlFor="menu-search" className="sr-only">
        Search menu items
      </label>
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          id="menu-search"
          className="menu-search w-full rounded-full border border-line bg-paper py-2 pl-10 pr-10 text-sm text-ink placeholder:text-muted"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClear()
          }}
          placeholder="Search menu items..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

function CategorySections({ groups, searching }) {
  return (
    <div className="space-y-8 sm:space-y-10">
      {searching ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Search results</p>
      ) : null}
      {groups.map((category) => (
        <section key={category.id} id={searching ? undefined : category.id} className={searching ? '' : 'scroll-mt-[7.5rem]'}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl tracking-wide text-ink sm:text-[1.35rem]">{category.name}</h2>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
              {category.items.length} {category.items.length === 1 ? 'item' : 'items'}
            </p>
          </div>
          <ul className="space-y-2.5">
            {category.items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function PublicMenu() {
  const { slug } = useParams()
  const navRef = useRef(null)
  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [activeId, setActiveId] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setFailed(false)
      const { data, error: restError } = await getPublicRestaurant(slug)
      if (!active) return
      if (restError || !data) {
        setRestaurant(null)
        setFailed(true)
        setLoading(false)
        return
      }
      const menu = await getPublicMenu(data.id)
      if (!active) return
      if (menu.error) {
        setRestaurant(null)
        setFailed(true)
        setLoading(false)
        return
      }
      setRestaurant(data)
      setCategories(menu.categories)
      setItems(menu.items)
      setQuery('')
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [slug])

  const grouped = useMemo(() => {
    return categories
      .map((category) => ({
        ...category,
        items: items
          .filter((item) => item.category_id === category.id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }))
      .filter((category) => category.items.length > 0)
  }, [categories, items])

  const needle = normalizeQuery(query)
  const searching = needle.length > 0
  const results = useMemo(() => {
    if (!searching) return grouped
    return grouped
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => itemMatches(item, category, needle)),
      }))
      .filter((category) => category.items.length > 0)
  }, [grouped, needle, searching])

  useEffect(() => {
    if (!restaurant?.name) return
    const prev = document.title
    document.title = restaurant.name
    return () => {
      document.title = prev
    }
  }, [restaurant])

  useEffect(() => {
    if (grouped.length === 0) {
      setActiveId('')
      return
    }
    setActiveId((current) => (grouped.some((c) => c.id === current) ? current : grouped[0].id))
  }, [grouped])

  useEffect(() => {
    if (searching || grouped.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-72px 0px -65% 0px', threshold: [0, 0.15] },
    )
    grouped.forEach((category) => {
      const el = document.getElementById(category.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [grouped, searching])

  useEffect(() => {
    if (searching || !activeId || !navRef.current) return
    const chip = navRef.current.querySelector(`[data-cat="${activeId}"]`)
    if (chip) chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeId, searching])

  function goToCategory(event, id) {
    event.preventDefault()
    if (searching) setQuery('')
    setActiveId(id)
    requestAnimationFrame(() => {
      const section = document.getElementById(id)
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function clearSearch() {
    setQuery('')
  }

  if (loading) return <MenuSkeleton />

  if (failed || !restaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="max-w-sm text-center">
          <p className="font-display text-2xl text-ink">Menu unavailable</p>
          <p className="mt-2 text-sm text-muted">Please try again later.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-card px-4 py-5 sm:py-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <RestaurantMark restaurant={restaurant} />
          <h1 className="mt-3 font-display text-[1.65rem] leading-tight text-ink sm:text-3xl">{restaurant.name}</h1>
          {restaurant.address ? <p className="mt-1.5 max-w-md text-[13px] leading-snug text-muted">{restaurant.address}</p> : null}
          {restaurant.phone ? (
            <a href={`tel:${restaurant.phone.replace(/\s+/g, '')}`} className="mt-0.5 text-[13px] text-muted">
              {restaurant.phone}
            </a>
          ) : null}
        </div>
      </header>

      {grouped.length > 0 ? (
        <div className="sticky top-0 z-20 border-b border-line bg-card/95 pb-2.5 backdrop-blur">
          <MenuSearch value={query} onChange={setQuery} onClear={clearSearch} />
          <nav className="mt-2" aria-label="Menu categories">
            <div ref={navRef} className="no-scrollbar mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-4">
              {grouped.map((category) => {
                const on = !searching && category.id === activeId
                return (
                  <a
                    key={category.id}
                    href={`#${category.id}`}
                    data-cat={category.id}
                    onClick={(event) => goToCategory(event, category.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium tracking-wide transition-colors ${
                      on ? 'bg-forest text-[#f5ead8]' : 'bg-paper text-muted ring-1 ring-line'
                    }`}
                  >
                    {category.name}
                  </a>
                )
              })}
            </div>
          </nav>
        </div>
      ) : null}

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-line bg-card px-6 py-14 text-center">
            <p className="font-display text-xl text-ink">Menu coming soon</p>
            <p className="mt-2 text-sm text-muted">This restaurant has not added dishes yet.</p>
          </div>
        ) : searching && results.length === 0 ? (
          <div className="rounded-2xl border border-line bg-card px-6 py-14 text-center">
            <p className="font-display text-xl text-ink">No items found</p>
            <p className="mt-2 text-sm text-muted">Try searching for another dish.</p>
          </div>
        ) : (
          <CategorySections groups={searching ? results : grouped} searching={searching} />
        )}
      </main>

      <footer className="px-4 pb-8 pt-2 text-center text-[11px] tracking-wide text-muted">Powered by BSB Digital Menu</footer>
    </div>
  )
}
