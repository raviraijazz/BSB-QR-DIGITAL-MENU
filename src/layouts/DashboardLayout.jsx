import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import NavIcon from '../components/NavIcon'
import RestaurantSwitcher from '../components/RestaurantSwitcher'
import { useAuth } from '../hooks/useAuth'
import { useRestaurant } from '../hooks/useRestaurant'

const links = [
  { to: '/dashboard', label: 'Overview', icon: 'overview', end: true },
  { to: '/dashboard/restaurant', label: 'Restaurant', icon: 'restaurant' },
  { to: '/dashboard/categories', label: 'Categories', icon: 'categories' },
  { to: '/dashboard/menu', label: 'Menu items', icon: 'menu' },
  { to: '/dashboard/qr', label: 'QR Studio', icon: 'qr' },
  { to: '/dashboard/settings', label: 'Settings', icon: 'settings' },
]

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const { restaurants, restaurant, loading, refresh, setRestaurant, selectRestaurant } = useRestaurant()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  function handleSelect(id) {
    selectRestaurant(id)
    if (location.search.includes('new=1')) navigate('/dashboard/restaurant', { replace: true })
  }

  const sidebar = (
    <>
      <div className="px-4 pt-4 pb-3">
        <p className="font-display text-lg tracking-tight">BSB</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted">Digital menu</p>
        <RestaurantSwitcher restaurants={restaurants} restaurant={restaurant} onSelect={handleSelect} />
      </div>
      <nav className="flex flex-col gap-0.5 px-3 pb-3">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                isActive ? 'bg-forest text-white' : 'text-stone-600 hover:bg-paper hover:text-ink'
              }`
            }
          >
            <NavIcon name={link.icon} />
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-line px-4 py-3">
        <p className="truncate text-xs text-muted">{user?.user_metadata?.username || 'Account'}</p>
        <button type="button" onClick={handleSignOut} className="mt-1 text-sm text-muted hover:text-ink">
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      {navOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[232px] flex-col border-r border-line bg-card shadow-sm transition-transform lg:static lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {sidebar}
      </aside>

      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-line bg-card px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white"
          >
            <NavIcon name="menuToggle" />
          </button>
          <p className="min-w-0 truncate text-sm font-medium">{restaurant?.name || 'BSB'}</p>
          <span className="w-10" />
        </div>
        <div className="px-4 py-6 sm:px-8">
          <Outlet context={{ user, restaurants, restaurant, loading, refresh, setRestaurant, selectRestaurant }} />
        </div>
      </div>
    </div>
  )
}
