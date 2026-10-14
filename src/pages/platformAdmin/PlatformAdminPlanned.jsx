import { Link, useLocation } from 'react-router-dom'
import { PLATFORM_ADMIN_HOME } from '../../lib/platformAdmin'

export default function PlatformAdminPlanned() {
  const location = useLocation()
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Planned feature</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          <span className="font-medium text-slate-600">{location.pathname}</span> is not available yet. Founder Console
          currently ships the Dashboard and Restaurants sections.
        </p>
        <Link
          to={PLATFORM_ADMIN_HOME}
          className="mt-5 inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
