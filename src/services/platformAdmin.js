import { supabase } from '../lib/supabase'

function friendly(error) {
  const raw = String(error?.message || '')
  if (raw.includes('Failed to send a request') || raw.includes('FunctionsFetchError') || raw.includes('Failed to fetch')) {
    return new Error('Founder Console backend is not reachable. Deploy supabase/functions/platform-admin.')
  }
  if (raw.includes('non-2xx')) return new Error('Founder Console request was rejected. Check your access.')
  return new Error(raw || 'Something went wrong. Please try again.')
}

export async function platformAdminCall(action, payload = {}) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const { data, error } = await supabase.functions.invoke('platform-admin', {
    body: { action, ...payload },
  })
  if (error) {
    // Non-2xx responses carry a JSON body in error.context.
    try {
      const body = await error.context?.json?.()
      if (body?.error) return { data: null, error: new Error(body.error) }
    } catch {
      /* fall through */
    }
    return { data: null, error: friendly(error) }
  }
  if (data?.error) return { data: null, error: new Error(data.error) }
  return { data, error: null }
}

export function whoami() {
  return platformAdminCall('whoami')
}

export function loadOverview({ from, to } = {}) {
  return platformAdminCall('overview', { from, to })
}

export function listPlatformRestaurants({ search = '', status = '', page = 1, pageSize = 20 } = {}) {
  return platformAdminCall('restaurants', { search, status, page, pageSize })
}

export function getPlatformRestaurant(id) {
  return platformAdminCall('restaurant', { id })
}
