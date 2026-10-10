import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { forbiddenPath, unauthenticatedPath } from '../lib/routeGuards'
import Spinner from './Spinner'

export default function ProtectedRoute({ allow = 'owner' }) {
  const { user, loading, isOwner, isWaiter } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) {
    const next = unauthenticatedPath(allow, location.pathname)
    return <Navigate to={next.to} replace state={next.state} />
  }
  const blocked = forbiddenPath(allow, { isOwner, isWaiter })
  if (blocked) return <Navigate to={blocked} replace />
  return <Outlet />
}
