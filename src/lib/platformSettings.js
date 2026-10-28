export const DEFAULT_PUBLIC_SETTINGS = {
  display_name: 'BSB Digital Menu',
  tagline: 'Simple digital menus for modern restaurants.',
  support_email: 'bsbagency4u@gmail.com',
  support_phone: '+91 97214 50099',
  support_whatsapp: '919721450099',
  support_hours: '',
  registration_enabled: true,
  registration_message: '',
  maintenance_enabled: false,
  maintenance_message: '',
}

export const DEFAULT_REGISTRATION_CLOSED_MESSAGE =
  'New restaurant registrations are currently closed. Existing owners and waiters can still sign in.'

export const DEFAULT_MAINTENANCE_MESSAGE =
  'The restaurant dashboard is temporarily unavailable for maintenance. Guest menus stay online. Please try again later.'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeWhatsapp(value) {
  return String(value || '').replace(/[^0-9]/g, '')
}

export function whatsappHref(value) {
  const digits = normalizeWhatsapp(value)
  return digits ? `https://wa.me/${digits}` : ''
}

export function cloneSettings(input) {
  return { ...DEFAULT_PUBLIC_SETTINGS, ...(input || {}) }
}

export function publicSettingsFromPayload(input) {
  const row = input || {}
  const displayName = String(row.display_name || DEFAULT_PUBLIC_SETTINGS.display_name).trim()
  const supportEmail = String(row.support_email || DEFAULT_PUBLIC_SETTINGS.support_email).trim()
  const supportPhone = String(row.support_phone || DEFAULT_PUBLIC_SETTINGS.support_phone).trim()
  return {
    display_name: displayName || DEFAULT_PUBLIC_SETTINGS.display_name,
    tagline: String(row.tagline ?? DEFAULT_PUBLIC_SETTINGS.tagline),
    support_email: supportEmail || DEFAULT_PUBLIC_SETTINGS.support_email,
    support_phone: supportPhone || DEFAULT_PUBLIC_SETTINGS.support_phone,
    support_whatsapp:
      normalizeWhatsapp(row.support_whatsapp || DEFAULT_PUBLIC_SETTINGS.support_whatsapp) ||
      DEFAULT_PUBLIC_SETTINGS.support_whatsapp,
    support_hours: String(row.support_hours ?? ''),
    registration_enabled: row.registration_enabled !== false,
    registration_message: String(row.registration_message ?? ''),
    maintenance_enabled: Boolean(row.maintenance_enabled),
    maintenance_message: String(row.maintenance_message ?? ''),
  }
}

export function adminSettingsFromPayload(input) {
  return {
    ...publicSettingsFromPayload(input),
    updated_at: input?.updated_at || null,
    updated_by: input?.updated_by || null,
    updated_by_username: String(input?.updated_by_username || ''),
  }
}

export function validateSettings(input) {
  const name = String(input?.display_name || '').trim()
  if (name.length < 2 || name.length > 80) return 'Platform name must be between 2 and 80 characters'
  if (String(input?.tagline ?? '').length > 160) return 'Tagline must be 160 characters or fewer'
  const email = String(input?.support_email || '').trim()
  if (!EMAIL_RE.test(email) || email.length > 120) return 'Enter a valid support email'
  const phone = String(input?.support_phone || '').trim()
  if (phone.length < 8 || phone.length > 32) return 'Enter a valid support phone number'
  const whatsapp = normalizeWhatsapp(input?.support_whatsapp)
  if (whatsapp.length < 10 || whatsapp.length > 15) return 'WhatsApp number must be 10 to 15 digits'
  if (String(input?.support_hours ?? '').length > 120) return 'Support hours must be 120 characters or fewer'
  if (String(input?.registration_message ?? '').length > 280) return 'Registration message must be 280 characters or fewer'
  if (String(input?.maintenance_message ?? '').length > 500) return 'Maintenance message must be 500 characters or fewer'
  return ''
}

export function buildSettingsPayload(input) {
  return {
    display_name: String(input?.display_name || '').trim(),
    tagline: String(input?.tagline ?? ''),
    support_email: String(input?.support_email || '').trim().toLowerCase(),
    support_phone: String(input?.support_phone || '').trim(),
    support_whatsapp: normalizeWhatsapp(input?.support_whatsapp),
    support_hours: String(input?.support_hours || '').trim(),
    registration_enabled: input?.registration_enabled !== false,
    registration_message: String(input?.registration_message || '').trim(),
    maintenance_enabled: Boolean(input?.maintenance_enabled),
    maintenance_message: String(input?.maintenance_message || '').trim(),
  }
}

export function highImpactWarnings(before, after) {
  const warnings = []
  if (before?.registration_enabled !== false && after?.registration_enabled === false) {
    warnings.push('New restaurant owner sign-up will be blocked. Existing owners and waiters can still log in.')
  }
  if (!before?.maintenance_enabled && after?.maintenance_enabled) {
    warnings.push(
      'Owner dashboards and waiter POS will be blocked until you turn maintenance off. Guest QR menus and Founder Console stay available.',
    )
  }
  return warnings
}

export function registrationClosedMessage(settings) {
  return String(settings?.registration_message || '').trim() || DEFAULT_REGISTRATION_CLOSED_MESSAGE
}

export function maintenanceDisplayMessage(settings) {
  return String(settings?.maintenance_message || '').trim() || DEFAULT_MAINTENANCE_MESSAGE
}

export function staffAccessBlocked(settings, { isAdmin = false } = {}) {
  return Boolean(settings?.maintenance_enabled) && !isAdmin
}

export function signupAllowed(settings) {
  return settings?.registration_enabled !== false
}

export function resettableDefaults() {
  return cloneSettings(DEFAULT_PUBLIC_SETTINGS)
}

export const SETTING_EFFECTS = {
  identity:
    'Takes effect immediately on the public site after save. Refresh open marketing pages to see the new name and contact details.',
  registration:
    'Takes effect immediately. New owner profile creation is denied server-side. Existing owner and waiter logins are unchanged.',
  maintenance:
    'Takes effect immediately. Owner and waiter privileged helpers are denied until a founder turns this off from Global Settings. Guest menus stay online.',
}
