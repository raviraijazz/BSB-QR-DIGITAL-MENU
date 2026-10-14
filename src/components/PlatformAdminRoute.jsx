import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'
import Button from './Button'
import Spinner from './Spinner'

function AccessDenied() {
  const { signOut } = useAuth()
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-500">
          This account is not authorized for the Founder Console. Platform-admin access is granted only through the
          server-side allowlist.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/dashboard">
            <Button variant="secondary">Go to dashboard</Button>
          </Link>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformAdminRoute() {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, checked, checking, error, verify } = usePlatformAdmin()
  const location = useLocation()

  useEffect(() => {
    if (!authLoading && user && !checked && !checking) verify()
  }, [authLoading, user, checked, checking, verify])

  if (authLoading || (user && !checked)) return <Spinner />
  if (!user) return <Navigate to="/platform-admin/login" replace state={{ from: location.pathname }} />
  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Founder Console unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <p className="mt-3 text-xs text-slate-400">
            Apply supabase/platform-admin.sql and deploy the platform-admin function, then reload.
          </p>
        </div>
      </div>
    )
  }
  if (!isAdmin) return <AccessDenied />
  return <Outlet />
}
