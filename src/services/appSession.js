import { supabase } from '../lib/supabase'

function wrap(error) {
  return { data: null, error: new Error(error?.message || 'Session request failed.') }
}

function missingOk() {
  const text = ''
  return { data: null, error: null, missing: true, text }
}

function isMissing(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find')
}

export async function startAppSession(userAgent = '') {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const { data, error } = await supabase.rpc('platform_session_start', { p_user_agent: userAgent })
  if (error && isMissing(error)) return missingOk()
  if (error) return wrap(error)
  return { data, error: null }
}

export async function touchAppSession() {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const { data, error } = await supabase.rpc('platform_session_touch')
  if (error && isMissing(error)) return missingOk()
  if (error) return wrap(error)
  return { data, error: null }
}

export async function heartbeatAppSession() {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const { data, error } = await supabase.rpc('platform_session_heartbeat')
  if (error && isMissing(error)) return missingOk()
  if (error) return wrap(error)
  return { data, error: null }
}

export async function endAppSession(reason = 'sign_out') {
  if (!supabase) return { data: null, error: null }
  const { error } = await supabase.rpc('platform_session_end', { p_reason: reason })
  if (error && isMissing(error)) return { data: null, error: null }
  return { data: null, error: error ? new Error(error.message) : null }
}

export function getSessionPolicies() {
  return supabase.rpc('platform_get_session_policies')
}

export function setSessionPolicies(policies) {
  return supabase.rpc('platform_set_session_policies', { p_policies: policies })
}

export function listAppSessions() {
  return supabase.rpc('platform_list_app_sessions')
}

export function revokeAppSession(id, reason = '') {
  return supabase.rpc('platform_revoke_app_session', { p_id: id, p_reason: reason })
}

export function revokeUserSessions(userId, reason = '') {
  return supabase.rpc('platform_revoke_user_sessions', { p_user_id: userId, p_reason: reason })
}
