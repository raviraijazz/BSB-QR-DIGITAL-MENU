import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { guestHomePath } from '../lib/routeGuards'
import Spinner from './Spinner'

export default function GuestRoute({ allow = 'owner' }) {
  const { user, loading, isOwner, isWaiter } = useAuth()
  if (loading) return <Spinner />
  const home = guestHomePath(allow, { user, isOwner, isWaiter })
  if (home) return <Navigate to={home} replace />
  return <Outlet />
}
