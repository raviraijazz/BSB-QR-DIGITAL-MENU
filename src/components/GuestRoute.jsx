import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { guestHomePath } from '../lib/routeGuards'
import Spinner from './Spinner'

export default function GuestRoute({ allow = 'owner' }) {
  const { user, loading, isOwner, isWaiter } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (typeof location.state?.notice === 'string' && location.state.notice) return <Outlet />
  const home = guestHomePath(allow, { user, isOwner, isWaiter })
  if (home) return <Navigate to={home} replace />
  return <Outlet />
}
