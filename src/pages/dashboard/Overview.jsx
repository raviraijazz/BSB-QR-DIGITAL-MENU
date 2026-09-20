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
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-paper text-forest">
          <NavIcon name={icon} />
        </div>
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none">{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </Card>
  )
}

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
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-[1.75rem]">{restaurant.name}</h1>
          <p className="mt-1 text-sm text-muted">Your digital menu dashboard</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <NavIcon name="external" />
              View Public Menu
            </Button>
          </a>
          <Link to="/dashboard/qr">
            <Button>
              <NavIcon name="qr" />
              QR Studio
            </Button>
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Card className="p-4 sm:p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Public menu</p>
        <p className="mt-2 break-all text-sm text-ink">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="secondary">Open Menu</Button>
          </a>
          <Button variant="secondary" onClick={copyLink}>
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

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card title="Quick actions">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/dashboard/menu">
              <Button className="w-full">
                <NavIcon name="plus" />
                Add Menu Item
              </Button>
            </Link>
            <Link to="/dashboard/categories">
              <Button variant="secondary" className="w-full">Manage Categories</Button>
            </Link>
            <Link to="/dashboard/qr">
              <Button variant="secondary" className="w-full">QR Code Studio</Button>
            </Link>
            <Link to="/dashboard/restaurant">
              <Button variant="secondary" className="w-full">Restaurant Profile</Button>
            </Link>
            <a href={url} target="_blank" rel="noreferrer" className="sm:col-span-2">
              <Button variant="secondary" className="w-full">View Public Menu</Button>
            </a>
          </div>
        </Card>

        <Card title="Menu status">
          {stats.items === 0 ? (
            <div>
              <p className="text-sm text-muted">No menu items yet</p>
              <Link to="/dashboard/menu" className="mt-3 inline-block">
                <Button>Add your first item</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm">
                  <span>Available items</span>
                  <span>{stats.available}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full bg-forest" style={{ width: `${Math.round((stats.available / stats.items) * 100)}%` }} />
                </div>
              </div>
              <p className="text-sm text-muted">Sold out items: {stats.soldOut}</p>
              <p className="text-sm text-muted">Total items: {stats.items}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card
          title="Restaurant"
          action={
            <Link to="/dashboard/restaurant" className="text-sm underline">
              Edit
            </Link>
          }
        >
          <div className="flex gap-3">
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

        <Card title="Your QR code">
          <div className="flex items-center gap-4">
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl border border-line bg-white">
              {qrPreview ? <img src={qrPreview} alt="" className="h-20 w-20" /> : <NavIcon name="qr" className="h-8 w-8 text-muted" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted">Your QR always opens the permanent public menu.</p>
              <Link to="/dashboard/qr" className="mt-3 inline-block">
                <Button variant="secondary">Open QR Studio</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Categories"
          action={
            categories.length > 6 ? (
              <Link to="/dashboard/categories" className="text-sm underline">
                View All Categories
              </Link>
            ) : null
          }
        >
          {shownCategories.length === 0 ? (
            <p className="text-sm text-muted">No categories yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {shownCategories.map((category) => (
                <li key={category.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="min-w-0 truncate">{category.name}</span>
                  <span className="shrink-0 text-muted">{category.count} items</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent menu items"
          action={
            <Link to="/dashboard/menu" className="text-sm underline">
              Manage
            </Link>
          }
        >
          {recentItems.length === 0 ? (
            <div>
              <p className="text-sm text-muted">No menu items added yet</p>
              <Link to="/dashboard/menu" className="mt-3 inline-block">
                <Button>Add Menu Item</Button>
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="h-11 w-11 rounded-lg object-cover" />
                  ) : (
                    <div className="h-11 w-11 rounded-lg bg-paper" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <FoodTypeMark value={item.food_type} />
                      <span className="min-w-0 truncate">{item.name}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{summaryPrice(item)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{item.is_available ? 'Available' : 'Sold Out'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
