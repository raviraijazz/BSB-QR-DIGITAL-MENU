import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import Alert from '../components/Alert'
import Button from '../components/Button'
import NavIcon from '../components/NavIcon'
import Spinner from '../components/Spinner'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'
import { loadRestaurantRuntime } from '../services/restaurantSettings'
import { endSupportSession, getPlatformRestaurant, startSupportSession } from '../services/platformAdmin'

const supportLinks = [
  { to: '', label: 'Overview', icon: 'overview', end: true },
  { to: 'categories', label: 'Categories', icon: 'categories' },
  { to: 'menu', label: 'Menu items', icon: 'menu' },
  { to: 'tables', label: 'Tables & QR', icon: 'tables' },
  { to: 'orders', label: 'Live Orders', icon: 'orders' },
  { to: 'kitchen', label: 'Kitchen', icon: 'kitchen' },
  { to: 'bills', label: 'Bills', icon: 'bills' },
  { to: 'collections', label: 'Collections', icon: 'collections' },
  { to: 'history', label: 'Order History', icon: 'history' },
  { to: 'reports', label: 'Reports', icon: 'reports' },
]

function navClass(isActive) {
  return `flex items-center gap-2.5 rounded-xl px-3 py-[7px] text-sm transition ${
    isActive ? 'bg-blue-600 text-white' : 'text-stone-600 hover:bg-paper hover:text-ink'
  }`
}

export default function FounderSupportLayout() {
  const { restaurantId } = useParams()
  const navigate = useNavigate()
  const { admin } = usePlatformAdmin()
  const [restaurant, setRestaurant] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(null)
  const [navOpen, setNavOpen] = useState(false)
  const sessionRef = useRef(null)

  const boot = useCallback(async () => {
    setLoading(true)
    setError('')
    setDenied(null)
    const { data: started, error: startError } = await startSupportSession(restaurantId, false)
    if (startError) {
      setDenied(startError.message)
      setLoading(false)
      return
    }
    sessionRef.current = started
    setSessionId(started)
    const { data, error: loadError } = await getPlatformRestaurant(restaurantId)
    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }
    const { data: hydrated } = await loadRestaurantRuntime(data.restaurant)
    setRestaurant(hydrated || data.restaurant)
    setLoading(false)
  }, [restaurantId])

  useEffect(() => {
    boot()
  }, [boot])

  const leave = useCallback(async () => {
    const current = sessionRef.current
    sessionRef.current = null
    if (current) await endSupportSession(current, 'left support panel')
    navigate('/platform-admin/restaurants', { replace: true })
  }, [navigate])

  useEffect(() => {
    return () => {
      // Ends the session if the founder navigates away from the support area.
      const current = sessionRef.current
      sessionRef.current = null
      if (current) endSupportSession(current, 'unmounted')
    }
  }, [])

  async function startRecovery() {
    setError('')
    const { data: started, error: startError } = await startSupportSession(restaurantId, true)
    if (startError) {
      setError(startError.message)
      return
    }
    sessionRef.current = started
    setSessionId(started)
    setDenied(null)
    setLoading(true)
    const { data, error: loadError } = await getPlatformRestaurant(restaurantId)
    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }
    const { data: hydrated } = await loadRestaurantRuntime(data.restaurant)
    setRestaurant(hydrated || data.restaurant)
    setLoading(false)
  }

  if (denied) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Support session blocked</h1>
          <p className="mt-2 text-sm text-slate-500">{denied}</p>
          <p className="mt-2 text-xs text-slate-400">
            Frozen and expired restaurants may be entered through an audited founder recovery session.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/platform-admin/restaurants')}>
              Back to restaurants
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={startRecovery}>
              Start recovery session
            </Button>
          </div>
          {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
        </div>
      </div>
    )
  }

  if (loading || !restaurant) return <Spinner label="Opening support session..." />

  const base = `/platform-admin/support/${restaurantId}`

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
        <div className="px-4 pt-4 pb-3">
          <p className="font-display text-lg tracking-tight">BSB</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted">Founder support</p>
          <p className="mt-2 truncate text-sm font-medium">{restaurant.name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
          {supportLinks.map((link) => (
            <NavLink
              key={link.to || 'overview'}
              to={link.to ? `${base}/${link.to}` : base}
              end={link.end}
              className={({ isActive }) => navClass(isActive)}
              onClick={() => setNavOpen(false)}
            >
              <NavIcon name={link.icon} className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-4 py-3">
          <p className="truncate text-xs text-muted">{admin?.username || 'Founder'}</p>
          <button type="button" onClick={leave} className="mt-1 text-sm text-muted hover:text-ink">
            Back to Founder Admin
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-30 border-b border-amber-300 bg-amber-100 px-4 py-2.5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-900">
              Founder Support Session — {restaurant.name}
            </p>
            <button
              type="button"
              onClick={leave}
              className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
            >
              Back to Founder Admin
            </button>
          </div>
          <p className="mt-0.5 text-xs text-amber-800">
            You are operating as a founder for this restaurant. Actions are audited. The owner&apos;s password is never
            used or revealed.
          </p>
        </div>

        <div className="flex items-center justify-between border-b border-line bg-card px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white"
          >
            <NavIcon name="menuToggle" />
          </button>
          <p className="min-w-0 truncate text-sm font-medium">{restaurant.name}</p>
          <span className="w-10" />
        </div>

        <div className="px-4 py-5 sm:px-7">
          <Outlet
            context={{
              user: admin,
              restaurants: [restaurant],
              restaurant,
              loading: false,
              refresh: async () => {},
              setRestaurant: () => {},
              selectRestaurant: () => {},
              supportSessionId: sessionId,
              founderSupport: true,
            }}
          />
        </div>
      </div>
    </div>
  )
}
