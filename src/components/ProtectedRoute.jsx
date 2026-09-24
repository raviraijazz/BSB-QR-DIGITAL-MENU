import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Spinner from './Spinner'

export default function ProtectedRoute({ allow = 'owner' }) {
  const { user, loading, isOwner, isWaiter } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) {
    const to = allow === 'waiter' ? '/waiter/login' : '/login'
    return <Navigate to={to} replace state={{ from: location.pathname }} />
  }
  if (allow === 'owner' && !isOwner) {
    return <Navigate to={isWaiter ? '/waiter' : '/'} replace />
  }
  if (allow === 'waiter' && !isWaiter) {
    return <Navigate to={isOwner ? '/dashboard' : '/'} replace />
  }
  return <Outlet />
}
