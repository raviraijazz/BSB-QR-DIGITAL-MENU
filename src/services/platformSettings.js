import { supabase } from '../lib/supabase'
import { publicSettingsFromPayload } from '../lib/platformSettings'

function isMissing(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find')
}

export async function loadPublicPlatformSettings() {
  if (!supabase) return { data: publicSettingsFromPayload(null), error: null, missing: true }
  const { data, error } = await supabase.rpc('platform_public_settings')
  if (error && isMissing(error)) return { data: publicSettingsFromPayload(null), error: null, missing: true }
  if (error) return { data: publicSettingsFromPayload(null), error: new Error(error.message), missing: false }
  return { data: publicSettingsFromPayload(data), error: null, missing: false }
}
