import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import FoodTypeMark from '../../components/FoodTypeMark'
import NavIcon from '../../components/NavIcon'
import Spinner from '../../components/Spinner'
import { menuUrl } from '../../lib/menuUrl'
import { summaryPrice } from '../../lib/pricing'
import { listCategories } from '../../services/categories'
import { listMenuItems } from '../../services/menuItems'

function StatCard({ icon, label, value, hint }) {
  return (
    <Card compact>
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper text-forest">
          <NavIcon name={icon} className="h-4 w-4" />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      </div>
      <p className="mt-3 font-display text-[1.75rem] leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Card>
  )
}

const compactBtn = 'h-9 px-3 py-0 text-[13px]'

export default function Overview() {
  const { restaurant, loading } = useOutletContext()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [qrPreview, setQrPreview] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!restaurant?.id) {
        setCategories([])
        setItems([])
        return
      }
      setBusy(true)
      setError('')
      const [cats, menu] = await Promise.all([listCategories(restaurant.id), listMenuItems(restaurant.id)])
      if (!active) return
      setCategories(cats.data)
      setItems(menu.data)
      setError(cats.error?.message || menu.error?.message || '')
      setBusy(false)
    }
    load()
    return () => {
      active = false
    }
  }, [restaurant?.id])

  const url = restaurant?.slug ? menuUrl(restaurant.slug) : ''

  useEffect(() => {
    let cancelled = false
    setQrPreview('')
    if (!url) return undefined
    import('qrcode')
      .then((QRCode) => QRCode.default.toDataURL(url, { width: 220, margin: 1, color: { dark: '#1f3d32', light: '#fffdf9' } }))
      .then((data) => {
        if (!cancelled) setQrPreview(data)
      })
      .catch(() => {
        if (!cancelled) setQrPreview('')
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const stats = useMemo(() => {
    const available = items.filter((item) => item.is_available !== false).length
    const soldOut = items.length - available
    return {
      categories: categories.length,
      items: items.length,
      available,
      soldOut,
    }
  }, [categories, items])

  const categoryCounts = useMemo(() => {
    return categories.map((category) => ({
      ...category,
      count: items.filter((item) => item.category_id === category.id).length,
    }))
  }, [categories, items])

  const recentItems = useMemo(() => {
    return [...items]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5)
  }, [items])

  const profileIncomplete = restaurant && (!restaurant.phone || !restaurant.address || !restaurant.logo_url)
  const shownCategories = categoryCounts.slice(0, 6)

  async function copyLink() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Set up your restaurant"
        body="Add restaurant name, phone, address and an optional logo. Then you can build the menu and generate a QR code."
        actionTo="/dashboard/restaurant"
        actionLabel="Set up restaurant"
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight">{restaurant.name}</h1>
          <p className="mt-0.5 text-sm text-muted">Your digital menu dashboard</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="secondary" className={compactBtn}>
              <NavIcon name="external" className="h-4 w-4" />
              View Public Menu
            </Button>
          </a>
          <Link to="/dashboard/qr">
            <Button className={compactBtn}>
              <NavIcon name="qr" className="h-4 w-4" />
              QR Studio
            </Button>
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Card compact className="!p-3 sm:!p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Public menu</p>
        <p className="mt-1 truncate text-sm text-ink">{url}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="secondary" className={compactBtn}>Open Menu</Button>
          </a>
          <Button variant="secondary" className={compactBtn} onClick={copyLink}>
            {copied ? 'Copied' : 'Copy Link'}
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="folder" label="Categories" value={busy ? '—' : stats.categories} hint="Menu sections" />
        <StatCard icon="menu" label="Menu Items" value={busy ? '—' : stats.items} hint="All dishes in this restaurant" />
        <StatCard icon="available" label="Available" value={busy ? '—' : stats.available} hint="Ready to show guests" />
        <StatCard icon="sold" label="Sold Out" value={busy ? '—' : stats.soldOut} hint="Hidden as unavailable" />
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <Card title="Quick actions" compact className="h-full">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/dashboard/menu" className="sm:col-span-2">
              <Button className={`w-full ${compactBtn}`}>
                <NavIcon name="plus" className="h-4 w-4" />
                Add Menu Item
              </Button>
            </Link>
            <Link to="/dashboard/categories">
              <Button variant="secondary" className={`w-full ${compactBtn}`}>Manage Categories</Button>
            </Link>
            <Link to="/dashboard/tables">
              <Button variant="secondary" className={`w-full ${compactBtn}`}>Tables</Button>
            </Link>
            <Link to="/dashboard/qr">
              <Button variant="secondary" className={`w-full ${compactBtn}`}>QR Code Studio</Button>
            </Link>
            <Link to="/dashboard/restaurant">
              <Button variant="secondary" className={`w-full ${compactBtn}`}>Restaurant Profile</Button>
            </Link>
            <a href={url} target="_blank" rel="noreferrer">
              <Button variant="secondary" className={`w-full ${compactBtn}`}>View Public Menu</Button>
            </a>
          </div>
        </Card>

        <Card title="Menu status" compact className="flex h-full flex-col">
          {stats.items === 0 ? (
            <div className="flex flex-1 flex-col justify-center">
              <p className="text-sm text-muted">No menu items yet</p>
              <Link to="/dashboard/menu" className="mt-3 inline-block">
                <Button className={compactBtn}>Add your first item</Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center space-y-3">
              <div>
                <div className="flex justify-between text-sm">
                  <span>Available items</span>
                  <span>{stats.available}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-forest" style={{ width: `${Math.round((stats.available / stats.items) * 100)}%` }} />
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Sold out items</span>
                <span>{stats.soldOut}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Total items</span>
                <span>{stats.items}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <Card
          className="flex h-full flex-col"
          compact
          title="Restaurant"
          action={
            <Link to="/dashboard/restaurant" className="text-sm text-forest underline">
              Edit
            </Link>
          }
        >
          <div className="flex flex-1 items-start gap-3">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-forest font-display text-sm text-[#f6f1ea]">
                {restaurant.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium">{restaurant.name}</p>
              <p className="truncate text-sm text-muted">{restaurant.phone || 'Phone not added'}</p>
              <p className="line-clamp-2 text-sm text-muted">{restaurant.address || 'Address not added'}</p>
            </div>
          </div>
          {profileIncomplete ? (
            <p className="mt-3 text-sm text-muted">
              Complete your restaurant profile.{' '}
              <Link to="/dashboard/restaurant" className="underline">
                Edit Restaurant
              </Link>
            </p>
          ) : null}
        </Card>

        <Card title="Your QR code" compact className="flex h-full flex-col">
          <div className="flex flex-1 items-center gap-4">
            <div className="grid h-28 w-28 shrink-0 place-items-center rounded-xl border border-line bg-white">
              {qrPreview ? <img src={qrPreview} alt="" className="h-24 w-24" /> : <NavIcon name="qr" className="h-8 w-8 text-muted" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted">Your QR always opens the permanent public menu.</p>
              <Link to="/dashboard/qr" className="mt-3 inline-block">
                <Button variant="secondary" className={compactBtn}>Open QR Studio</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          compact
          title="Categories"
          action={
            categories.length > 6 ? (
              <Link to="/dashboard/categories" className="text-sm text-forest underline">
                View All Categories
              </Link>
            ) : null
          }
        >
          {shownCategories.length === 0 ? (
            <p className="text-sm text-muted">No categories yet.</p>
          ) : (
            <ul>
              {shownCategories.map((category, index) => (
                <li
                  key={category.id}
                  className={`flex items-center justify-between py-2.5 text-sm ${index > 0 ? 'border-t border-line' : ''}`}
                >
                  <span className="min-w-0 truncate font-medium uppercase tracking-wide">{category.name}</span>
                  <span className="shrink-0 text-muted">{category.count} items</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          compact
          title="Recent menu items"
          action={
            <Link to="/dashboard/menu" className="text-sm text-forest underline">
              Manage
            </Link>
          }
        >
          {recentItems.length === 0 ? (
            <div>
              <p className="text-sm text-muted">No menu items added yet</p>
              <Link to="/dashboard/menu" className="mt-3 inline-block">
                <Button className={compactBtn}>Add Menu Item</Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {recentItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-paper" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <FoodTypeMark value={item.food_type} />
                      <span className="min-w-0 truncate">{item.name}</span>
                    </p>
                    <p className="truncate text-sm text-ink">{summaryPrice(item)}</p>
                  </div>
                  <span className={`shrink-0 text-xs ${item.is_available ? 'text-forest' : 'text-muted'}`}>
                    {item.is_available ? 'Available' : 'Sold Out'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
