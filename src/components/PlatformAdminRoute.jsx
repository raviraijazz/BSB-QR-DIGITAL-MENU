import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'
import { founderGateRedirect } from '../../supabase/functions/_shared/founder-gate.js'
import Button from './Button'
import Spinner from './Spinner'

function AccessDenied() {
  const { signOut } = useAuth()
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-500">You are not authorized to access the Platform Admin Panel.</p>
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

function FounderConsoleError({ message, onRetry, onSignIn }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Founder Console unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformAdminRoute() {
  const { user, loading: authLoading, signOut } = useAuth()
  const {
    isAdmin,
    mustChangePassword,
    needsSignIn,
    checked,
    checking,
    error,
    verify,
  } = usePlatformAdmin()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && user && !checked && !checking) verify()
  }, [authLoading, user, checked, checking, verify])

  async function handleSignInAgain() {
    await signOut()
    navigate('/platform-admin/login', { replace: true })
  }

  // Wait for session restoration and server-side verification. Never report
  // "not signed in" while either is still in flight.
  if (authLoading || (user && (!checked || checking))) {
    return <Spinner full label="Loading Founder Console..." />
  }
  if (!user) return <Navigate to="/platform-admin/login" replace state={{ from: location.pathname }} />

  // The session ended or expired mid-flight: return to sign-in rather than
  // claiming the database migration or function is missing.
  if (needsSignIn) return <Navigate to="/platform-admin/login" replace state={{ from: location.pathname }} />

  if (error) {
    return (
      <FounderConsoleError
        message={error}
        onRetry={() => verify()}
        onSignIn={handleSignInAgain}
      />
    )
  }
  if (!isAdmin) return <AccessDenied />

  // First-login gate: until the temporary password is rotated on the server,
  // every Founder Console route is replaced by the password-change page, and
  // the change page itself is unavailable once the gate is cleared.
  const redirect = founderGateRedirect({
    isAdmin,
    mustChangePassword,
    pathname: location.pathname,
  })
  if (redirect) return <Navigate to={redirect} replace />

  return <Outlet />
}
