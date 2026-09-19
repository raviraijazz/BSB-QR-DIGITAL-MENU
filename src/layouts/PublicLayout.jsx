import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const nav = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/#demo', label: 'Demo' },
  { href: '/#contact', label: 'Contact' },
]

export default function PublicLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const isHome = pathname === '/'

  function close() {
    setOpen(false)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-[#ece7df] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" onClick={close}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest font-display text-xs text-[#f6f1ea]">
              BSB
            </span>
            <span className="font-display text-[1.05rem] leading-tight tracking-tight text-ink">
              Digital Menu
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-stone-600 lg:flex">
            {nav.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-forest">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {user ? (
              <Link
                to="/dashboard"
                className="rounded-full bg-forest px-4 py-2 text-sm text-white transition hover:bg-forest-deep"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-full px-3 py-2 text-sm text-stone-600 transition hover:text-ink">
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="rounded-full bg-forest px-4 py-2 text-sm text-white transition hover:bg-forest-deep"
                >
                  Create Your Menu
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-ink lg:hidden"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1.5 block h-0.5 w-5 bg-current" />
            <span className="mt-1.5 block h-0.5 w-5 bg-current" />
          </button>
        </div>
        {open ? (
          <div className="border-t border-[#ece7df] bg-white px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-3 text-sm">
              {nav.map((item) => (
                <a key={item.href} href={item.href} onClick={close} className="py-1 text-stone-700">
                  {item.label}
                </a>
              ))}
              {user ? (
                <Link to="/dashboard" onClick={close} className="pt-2 font-medium text-forest">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={close} className="pt-2">
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    onClick={close}
                    className="rounded-full bg-forest px-4 py-2.5 text-center text-white"
                  >
                    Create Your Menu
                  </Link>
                </>
              )}
            </nav>
          </div>
        ) : null}
      </header>
      <main className={isHome ? 'bg-[#f7f4ee]' : ''}>
        <Outlet />
      </main>
    </div>
  )
}
