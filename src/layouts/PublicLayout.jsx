import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function PublicLayout() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xl font-medium tracking-tight">
            BSB Digital Menu
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <Link to="/dashboard" className="rounded-xl bg-ink px-4 py-2 text-white">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="px-3 py-2 text-muted hover:text-ink">
                  Log in
                </Link>
                <Link to="/signup" className="rounded-xl bg-ink px-4 py-2 text-white">
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
