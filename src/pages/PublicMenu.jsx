import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import { getPublicRestaurant } from '../services/restaurants'
import { getPublicMenu } from '../services/menuItems'

function formatPrice(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return ''
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
}

export default function PublicMenu() {
  const { slug } = useParams()
  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data, error: restError } = await getPublicRestaurant(slug)
      if (!active) return
      if (restError || !data) {
        setError('Menu not found.')
        setLoading(false)
        return
      }
      const menu = await getPublicMenu(data.id)
      if (!active) return
      setRestaurant(data)
      setCategories(menu.categories)
      setItems(menu.items)
      setError(menu.error?.message || '')
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
        items: items.filter((item) => item.category_id === category.id),
      }))
      .filter((category) => category.items.length > 0)
  }, [categories, items])

  if (loading) return <Spinner label="Opening menu..." />
  if (error || !restaurant) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-3xl">Menu unavailable</h1>
        <p className="mt-2 text-sm text-muted">{error || 'This restaurant has not published a menu yet.'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-card px-4 py-8 text-center">
        {restaurant.logo_url ? (
          <img src={restaurant.logo_url} alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover" />
        ) : null}
        <h1 className="font-display text-4xl">{restaurant.name}</h1>
        {restaurant.address ? <p className="mt-2 text-sm text-muted">{restaurant.address}</p> : null}
        {restaurant.phone ? <p className="mt-1 text-sm text-muted">{restaurant.phone}</p> : null}
      </header>
      <nav className="sticky top-0 z-10 overflow-x-auto border-b border-line bg-card/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          {grouped.map((category) => (
            <a
              key={category.id}
              href={`#${category.id}`}
              className="whitespace-nowrap rounded-full bg-paper px-3 py-1.5 text-sm"
            >
              {category.name}
            </a>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-xl space-y-10 px-4 py-8">
        {grouped.length === 0 ? (
          <p className="text-center text-sm text-muted">Menu coming soon.</p>
        ) : (
          grouped.map((category) => (
            <section key={category.id} id={category.id}>
              <h2 className="font-display text-2xl">{category.name}</h2>
              <ul className="mt-4 space-y-3">
                {category.items.map((item) => (
                  <li key={item.id} className={`rounded-2xl border border-line bg-card p-4 ${item.is_available ? '' : 'opacity-55'}`}>
                    <div className="flex gap-4">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-medium">{item.name}</h3>
                          <p className="shrink-0 text-sm">{formatPrice(item.price)}</p>
                        </div>
                        {item.description ? <p className="mt-1 text-sm text-muted">{item.description}</p> : null}
                        {!item.is_available ? <p className="mt-2 text-xs uppercase tracking-wide text-accent">Currently unavailable</p> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      <footer className="px-4 py-8 text-center text-xs text-muted">Powered by BSB Digital Menu</footer>
    </div>
  )
}
