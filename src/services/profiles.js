import { supabase } from '../lib/supabase'
import { normalizeUsername } from '../lib/auth'

export async function isUsernameAvailable(username) {
  const value = normalizeUsername(username)
  const { data, error } = await supabase.rpc('username_available', { p_username: value })
  if (error) return { available: null, error }
  return { available: Boolean(data), error: null }
}

export async function createProfile(userId, username) {
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    username: normalizeUsername(username),
  })
  return { error }
}
