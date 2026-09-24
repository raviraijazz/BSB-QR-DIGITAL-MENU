import { supabase } from '../lib/supabase'
import { normalizeUsername } from '../lib/auth'

export async function isUsernameAvailable(username) {
  const value = normalizeUsername(username)
  const { data, error } = await supabase.rpc('username_available', { p_username: value })
  if (error) return { available: null, error }
  return { available: Boolean(data), error: null }
}

export async function createProfile(userId, username, role = 'owner') {
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    username: normalizeUsername(username),
    role,
  })
  return { error }
}

export async function getMyProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('id', (await supabase.auth.getUser()).data.user?.id || '')
    .maybeSingle()
  return { data, error }
}

export function roleFromUser(user, profile) {
  const fromProfile = profile?.role
  if (fromProfile === 'owner' || fromProfile === 'waiter') return fromProfile
  const fromMeta = user?.user_metadata?.role
  if (fromMeta === 'owner' || fromMeta === 'waiter') return fromMeta
  return 'owner'
}
