const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/
const PHONE_RE = /^\+?[0-9]{10,15}$/
const AUTH_EMAIL_DOMAIN = 'auth.bsbdigitalmenu.local'
const WAITER_AUTH_EMAIL_DOMAIN = 'waiter.bsbdigitalmenu.local'

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

export function authEmailFromUsername(username) {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`
}

export function waiterAuthEmailFromWaiterId(waiterId) {
  return `${String(waiterId || '').trim().toLowerCase()}@${WAITER_AUTH_EMAIL_DOMAIN}`
}

export function validateWaiterLogin({ waiterId, password }) {
  if (!String(waiterId || '').trim()) return 'Waiter ID required'
  if (!USERNAME_RE.test(String(waiterId).trim())) {
    return 'Waiter ID must be 3–24 letters, numbers or underscores'
  }
  if (!password) return 'Password required'
  return ''
}

export function normalizePhone(value) {
  return String(value || '').replace(/[\s-]/g, '').trim()
}

export function validateSignup({ username, phone, password, confirmPassword }) {
  if (!username.trim()) return 'Username required'
  if (!USERNAME_RE.test(username.trim())) {
    return 'Username must be 3–24 letters, numbers or underscores'
  }
  const contact = normalizePhone(phone)
  if (!contact) return 'Contact number required'
  if (!PHONE_RE.test(contact)) return 'Enter a valid contact number'
  if (!password) return 'Password required'
  if (password.length < 6) return 'Password too short'
  if (password !== confirmPassword) return 'Passwords do not match'
  return ''
}

export function validateLogin({ username, password }) {
  if (!username.trim()) return 'Username required'
  if (!USERNAME_RE.test(username.trim())) {
    return 'Username must be 3–24 letters, numbers or underscores'
  }
  if (!password) return 'Password required'
  return ''
}

export function friendlyAuthError(error) {
  const msg = String(error?.message || '').toLowerCase()
  if (msg.includes('already registered') || msg.includes('user already')) return 'Username already exists'
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return 'Invalid username or password'
  if (msg.includes('email not confirmed')) return 'Account is not confirmed. Ask the restaurant owner to recreate the waiter login.'
  if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
    return 'Signup is paused for about 1 hour. Supabase is still sending confirmation emails. Turn off Confirm email, then wait and try again.'
  }
  return error?.message || 'Something went wrong. Please try again.'
}
