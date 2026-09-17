import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRestaurant } from '../hooks/useRestaurant'

const links = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/dashboard/restaurant', label: 'Restaurant' },
  { to: '/dashboard/categories', label: 'Categories' },
  { to: '/dashboard/menu', label: 'Menu items' },
  { to: '/dashboard/qr', label: 'QR code' },
  { to: '/dashboard/settings', label: 'Settings' },
]

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const { restaurant, loading, refresh, setRestaurant } = useRestaurant()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-card lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <div>
            <p className="font-display text-lg">BSB</p>
            <p className="text-xs text-muted">{restaurant?.name || 'Digital menu'}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-muted hover:text-ink lg:mt-6 lg:block"
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
        <Outlet context={{ user, restaurant, loading, refresh, setRestaurant }} />
      </div>
    </div>
  )
}
