import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { publicSettingsFromPayload } from '../lib/platformSettings'
import { loadPublicPlatformSettings } from '../services/platformSettings'

const PlatformSettingsContext = createContext(null)

export function PlatformSettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => publicSettingsFromPayload(null))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadPublicPlatformSettings().then(({ data }) => {
      if (!active) return
      setSettings(publicSettingsFromPayload(data))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const value = useMemo(() => ({ settings, loading }), [settings, loading])
  return <PlatformSettingsContext.Provider value={value}>{children}</PlatformSettingsContext.Provider>
}

export function usePlatformSettings() {
  const ctx = useContext(PlatformSettingsContext)
  if (!ctx) return { settings: publicSettingsFromPayload(null), loading: false }
  return ctx
}
