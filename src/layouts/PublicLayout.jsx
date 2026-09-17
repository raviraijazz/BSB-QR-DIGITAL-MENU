import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const nav = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#contact', label: 'Contact' },
]

export default function PublicLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const isHome = pathname === '/'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-[#f7f3ec]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" className="font-display text-[1.15rem] font-medium tracking-tight text-ink">
            BSB Digital Menu
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-stone-600 md:flex">
            {nav.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-forest">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <Link
                to="/dashboard"
                className="rounded-xl bg-forest px-4 py-2 text-sm text-white transition hover:bg-forest-deep"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-xl px-3 py-2 text-sm text-stone-600 transition hover:text-ink">
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-xl bg-forest px-4 py-2 text-sm text-white transition hover:bg-forest-deep"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-ink md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
          </button>
        </div>
        {open ? (
          <div className="border-t border-line bg-[#f7f3ec] px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-3 text-sm">
              {nav.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="py-1 text-stone-700">
                  {item.label}
                </a>
              ))}
              {user ? (
                <Link to="/dashboard" onClick={() => setOpen(false)} className="pt-2 font-medium text-forest">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setOpen(false)} className="pt-2">
                    Log in
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-forest px-4 py-2.5 text-center text-white"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </nav>
          </div>
        ) : null}
      </header>
      <main className={isHome ? 'bg-[#f4efe6]' : ''}>
        <Outlet />
      </main>
    </div>
  )
}
