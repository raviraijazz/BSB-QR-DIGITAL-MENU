import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import RestaurantSwitcher from '../components/RestaurantSwitcher'
import { useAuth } from '../hooks/useAuth'
import { useRestaurant } from '../hooks/useRestaurant'

const links = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/dashboard/restaurant', label: 'Restaurant' },
  { to: '/dashboard/categories', label: 'Categories' },
  { to: '/dashboard/menu', label: 'Menu items' },
  { to: '/dashboard/qr', label: 'QR Studio' },
  { to: '/dashboard/settings', label: 'Settings' },
]

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const { restaurants, restaurant, loading, refresh, setRestaurant, selectRestaurant } = useRestaurant()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  function handleSelect(id) {
    selectRestaurant(id)
    if (location.search.includes('new=1')) navigate('/dashboard/restaurant', { replace: true })
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-card lg:border-b-0 lg:border-r">
        <div className="flex items-start justify-between gap-4 px-5 py-4 lg:block">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg">BSB</p>
            <RestaurantSwitcher restaurants={restaurants} restaurant={restaurant} onSelect={handleSelect} />
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="shrink-0 text-sm text-muted hover:text-ink lg:mt-4 lg:block"
          >
            Sign out
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-xl px-3 py-2 text-sm ${
                  isActive ? 'bg-ink text-white' : 'text-stone-600 hover:bg-paper'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="px-4 py-6 sm:px-8">
        <Outlet context={{ user, restaurants, restaurant, loading, refresh, setRestaurant, selectRestaurant }} />
      </div>
    </div>
  )
}
