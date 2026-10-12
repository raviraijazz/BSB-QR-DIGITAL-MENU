import { supabase } from '../lib/supabase'

const UNEXPECTED = 'Unable to reset password right now. Please try again.'
const NOT_DEPLOYED = 'Password reset is not deployed yet. Deploy supabase/functions/reset-owner-password.'

export async function resetOwnerPassword({ newPassword, confirmPassword }) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { error: { message: UNEXPECTED } }
  const token = sessionData.session?.access_token
  if (!token) return { error: { message: 'Not signed in' } }

  const { data, error } = await supabase.functions.invoke('reset-owner-password', {
    body: {
      new_password: newPassword,
      confirm_password: confirmPassword,
    },
    headers: { Authorization: `Bearer ${token}` },
  })

  if (error) {
    const context = error.context
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json()
        if (body?.error) return { error: { message: body.error } }
      } catch {
        /* fall through */
      }
    }
    const text = String(error.message || '').toLowerCase()
    if (text.includes('failed to send') || text.includes('not found') || text.includes('404')) {
      return { error: { message: NOT_DEPLOYED } }
    }
    return { error: { message: error.message || UNEXPECTED } }
  }
  if (data?.error) return { error: { message: data.error } }
  if (!data?.success) return { error: { message: UNEXPECTED } }
  return { error: null }
}
