import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Spinner from './Spinner'

export default function GuestRoute({ allow = 'owner' }) {
  const { user, loading, isOwner, isWaiter } = useAuth()
  if (loading) return <Spinner />
  if (user && allow === 'owner' && isOwner) return <Navigate to="/dashboard" replace />
  if (user && allow === 'waiter' && isWaiter) return <Navigate to="/waiter" replace />
  if (user && allow === 'owner' && isWaiter) return <Navigate to="/waiter" replace />
  if (user && allow === 'waiter' && isOwner) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
