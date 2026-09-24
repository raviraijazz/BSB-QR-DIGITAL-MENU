import { Outlet, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useWaiter } from '../hooks/useWaiter'

export default function WaiterLayout() {
  const { user, signOut } = useAuth()
  const { waiter, restaurant, tables, loading, error } = useWaiter()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/waiter/login')
  }

  if (loading) return <Spinner />

  if (error === 'disabled' || waiter?.is_active === false) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Alert>Your waiter account is currently disabled. Please contact the restaurant owner.</Alert>
        <div className="mt-4">
          <Button className="w-full" onClick={handleSignOut}>
            Back to login
          </Button>
        </div>
      </div>
    )
  }

  if (!waiter) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Alert>{error || 'Waiter account not found.'}</Alert>
        <div className="mt-4">
          <Button className="w-full" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">BSB Digital Menu</p>
            <p className="truncate font-display text-lg leading-tight">{restaurant?.name || 'Restaurant'}</p>
          </div>
          <button type="button" onClick={handleSignOut} className="shrink-0 text-sm text-muted hover:text-ink">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet context={{ user, waiter, restaurant, tables, error }} />
      </main>
    </div>
  )
}
