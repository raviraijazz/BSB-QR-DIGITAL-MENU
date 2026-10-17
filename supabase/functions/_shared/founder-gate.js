// Shared Founder Console password-change gate.
// Imported by the edge functions (Deno) and the React app + node tests (Vite/Node).
// Pure logic only: no secrets, no network, no DOM.

export const FOUNDER_MUST_CHANGE_PATH = '/platform-admin/change-password'
export const FOUNDER_HOME_PATH = '/platform-admin'
export const FOUNDER_PASSWORD_MIN_LENGTH = 10

// Actions a locked founder (must_change_password = true) may still call.
// Everything else is denied server-side until the password is rotated.
export const FOUNDER_LOCKED_ACTIONS = ['whoami', 'change_password']

export function isFounderActionAllowed(action, mustChangePassword) {
  if (!mustChangePassword) return true
  return FOUNDER_LOCKED_ACTIONS.includes(String(action || ''))
}

function passwordClasses(password) {
  return [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length
}

// Returns an error message, or '' when the new password is acceptable.
export function validateNewFounderPassword(newPassword, confirmPassword, currentPassword = '') {
  const password = String(newPassword || '')
  if (!password) return 'New password is required'
  if (currentPassword && password === currentPassword) {
    return 'New password must be different from the current password'
  }
  if (password.length < FOUNDER_PASSWORD_MIN_LENGTH) {
    return `New password must be at least ${FOUNDER_PASSWORD_MIN_LENGTH} characters`
  }
  if (passwordClasses(password) < 3) {
    return 'Use at least three of: lowercase, uppercase, numbers, symbols'
  }
  if (!confirmPassword) return 'Confirm password required'
  if (password !== confirmPassword) return 'Passwords do not match'
  return ''
}

// Client-side navigation decision for a signed-in platform admin.
// Returns the path to redirect to, or null to stay.
export function founderGateRedirect({ isAdmin, mustChangePassword, pathname }) {
  if (!isAdmin) return null
  if (mustChangePassword && pathname !== FOUNDER_MUST_CHANGE_PATH) return FOUNDER_MUST_CHANGE_PATH
  if (!mustChangePassword && pathname === FOUNDER_MUST_CHANGE_PATH) return FOUNDER_HOME_PATH
  return null
}
