import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import NavIcon from '../components/NavIcon'
import RestaurantSwitcher from '../components/RestaurantSwitcher'
import { useAuth } from '../hooks/useAuth'
import { useRestaurant } from '../hooks/useRestaurant'
import { isTableWisePath, TABLE_WISE_HOME, TABLE_WISE_MODULES } from '../lib/tableWiseNav'

const topLinks = [
  { to: '/dashboard', label: 'Overview', icon: 'overview', end: true },
  { to: '/dashboard/restaurant', label: 'Restaurant', icon: 'restaurant' },
  { to: '/dashboard/categories', label: 'Categories', icon: 'categories' },
  { to: '/dashboard/menu', label: 'Menu items', icon: 'menu' },
]

const bottomLinks = [
  { to: '/dashboard/qr', label: 'QR Studio', icon: 'qr' },
  { to: '/dashboard/settings', label: 'Settings', icon: 'settings' },
]

function navClass(isActive) {
  return `flex items-center gap-2.5 rounded-xl px-3 py-[7px] text-sm transition ${
    isActive ? 'bg-forest text-white' : 'text-stone-600 hover:bg-paper hover:text-ink'
  }`
}

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const { restaurants, restaurant, loading, refresh, setRestaurant, selectRestaurant } = useRestaurant()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [tableWiseOpen, setTableWiseOpen] = useState(() => isTableWisePath(location.pathname))

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (isTableWisePath(location.pathname)) setTableWiseOpen(true)
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
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
        {topLinks.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => navClass(isActive)}>
            <NavIcon name={link.icon} className="h-4 w-4" />
            {link.label}
          </NavLink>
        ))}

        <div className="pt-1">
          <div
            className={`flex items-center rounded-xl ${
              isTableWisePath(location.pathname) ? 'bg-paper text-ink' : 'text-stone-600'
            }`}
          >
            <NavLink
              to={TABLE_WISE_HOME}
              end
              className={({ isActive }) =>
                `flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-[7px] text-sm transition ${
                  isActive ? 'text-ink' : 'hover:text-ink'
                }`
              }
            >
              <NavIcon name="tableWise" className="h-4 w-4" />
              <span className="min-w-0 uppercase tracking-[0.04em]">Table-wise order</span>
            </NavLink>
            <button
              type="button"
              aria-label="Toggle table-wise order"
              aria-expanded={tableWiseOpen}
              onClick={() => setTableWiseOpen((open) => !open)}
              className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/80"
            >
              <NavIcon
                name="chevron"
                className={`h-3.5 w-3.5 transition-transform ${tableWiseOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
          {tableWiseOpen ? (
            <div className="ml-3 mt-1 space-y-0.5 border-l border-line pl-2">
              {TABLE_WISE_MODULES.map((link) => (
                <NavLink key={link.to} to={link.to} className={({ isActive }) => navClass(isActive)}>
                  <NavIcon name={link.icon} className="h-4 w-4" />
                  {link.label}
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>

        {bottomLinks.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => navClass(isActive)}>
            <NavIcon name={link.icon} className="h-4 w-4" />
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
        <div className="px-4 py-5 sm:px-7">
          <Outlet context={{ user, restaurants, restaurant, loading, refresh, setRestaurant, selectRestaurant }} />
        </div>
      </div>
    </div>
  )
}
