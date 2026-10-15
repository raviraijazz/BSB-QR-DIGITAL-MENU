import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import NavIcon from '../components/NavIcon'
import { useAuth } from '../hooks/useAuth'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'
import { PLATFORM_NAV } from '../lib/platformAdmin'

function itemClass(isActive) {
  return `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`
}

function PlannedItem({ label, icon }) {
  return (
    <span
      title="Planned — not available yet"
      className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-500"
    >
      <NavIcon name={icon} className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      <span className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
        Soon
      </span>
    </span>
  )
}

function NavBlock({ item, onNavigate }) {
  if (item.type === 'group') {
    return (
      <div className="pt-2">
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
        <div className="space-y-0.5">
          {item.items.map((entry) =>
            entry.planned ? (
              <PlannedItem key={entry.label} label={entry.label} icon={entry.icon} />
            ) : (
              <NavLink key={entry.to} to={entry.to} onClick={onNavigate} className={({ isActive }) => itemClass(isActive)}>
                <NavIcon name={entry.icon} className="h-4 w-4" />
                {entry.label}
              </NavLink>
            ),
          )}
        </div>
      </div>
    )
  }
  if (item.planned) return <PlannedItem label={item.label} icon={item.icon} />
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => itemClass(isActive)}>
      <NavIcon name={item.icon} className="h-4 w-4" />
      {item.label}
    </NavLink>
  )
}

export default function PlatformAdminLayout() {
  const { signOut } = useAuth()
  const { admin } = usePlatformAdmin()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => setNavOpen(false), [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/platform-admin/login', { replace: true })
  }

  const sidebar = (
    <>
      <div className="border-b border-slate-800 px-4 py-4">
        <p className="font-display text-lg tracking-tight text-white">BSB</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-slate-400">Founder Console</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        {PLATFORM_NAV.map((item) => (
          <NavBlock key={item.label} item={item} onNavigate={() => setNavOpen(false)} />
        ))}
      </nav>
      <div className="mt-auto border-t border-slate-800 px-4 py-3">
        <p className="truncate text-xs text-slate-400">{admin?.username || 'Platform admin'}</p>
        <button type="button" onClick={handleSignOut} className="mt-1 text-sm text-slate-300 hover:text-white">
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[248px_1fr]">
      {navOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-slate-900 transition-transform lg:static lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {sidebar}
      </aside>

      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <NavIcon name="menuToggle" />
          </button>
          <p className="text-sm font-medium text-slate-700">Founder Console</p>
          <span className="w-10" />
        </div>
        <div className="px-4 py-5 sm:px-7">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
