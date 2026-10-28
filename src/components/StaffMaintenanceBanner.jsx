import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { maintenanceDisplayMessage } from '../lib/platformSettings'

export default function StaffMaintenanceBanner() {
  const { settings } = usePlatformSettings()
  if (!settings.maintenance_enabled) return null
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {maintenanceDisplayMessage(settings)}
    </div>
  )
}
