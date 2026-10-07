import { supabase } from '../lib/supabase'
import {
  applySettingsToRestaurant,
  defaultPaymentMethods,
  defaultRoles,
  defaultServiceCharges,
  defaultTaxRates,
  defaultWorkingHours,
  hydrateSettings,
  PERMISSION_GROUPS,
} from '../lib/restaurantSettings'
import { normalizePrinters, normalizeRoutes } from '../lib/printerRouting'

function friendlySettingsError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('does not exist') || text.includes('schema cache') || text.includes('printer_profiles') || text.includes('use_for')) {
    if (text.includes('print') || text.includes('printer_routes') || text.includes('use_for') || text.includes('stamp_kot')) {
      return { message: 'KOT printing is not ready. Run supabase/kot-printing.sql in the SQL Editor.' }
    }
    return { message: 'Restaurant settings are not ready. Run supabase/restaurant-settings.sql in the SQL Editor.' }
  }
  if (text.includes('row-level security') || text.includes('not allowed')) {
    return { message: 'Unable to save restaurant settings. Please try again.' }
  }
  return { message: 'Unable to save restaurant settings. Please try again.' }
}

function scalarPayload(restaurantId, form) {
  return {
    restaurant_id: restaurantId,
    restaurant_type: String(form.restaurant_type || '').trim(),
    owner_name: String(form.owner_name || '').trim(),
    email: String(form.email || '').trim(),
    alternate_phone: String(form.alternate_phone || '').trim(),
    gstin: String(form.gstin || '').trim().toUpperCase(),
    fssai: String(form.fssai || '').trim(),
    city: String(form.city || '').trim(),
    state: String(form.state || '').trim(),
    pin: String(form.pin || '').trim(),
    timezone: form.timezone || 'Asia/Kolkata',
    currency: form.currency || 'INR',
    website: String(form.website || '').trim(),
    facebook: String(form.facebook || '').trim(),
    instagram: String(form.instagram || '').trim(),
    google_maps: String(form.google_maps || '').trim(),
    tagline: String(form.tagline || '').trim(),
    thank_you_message: String(form.thank_you_message || '').trim(),
    terms: String(form.terms || '').trim(),
    primary_color: form.primary_color || '#1f3d32',
    secondary_color: form.secondary_color || '#c4a574',
    mark_url: form.mark_url || null,
    tax_enabled: Boolean(form.tax_enabled),
    tax_mode: form.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive',
    rounding: form.rounding || 'none',
    kot: form.kot || {},
    bill: form.bill || {},
    qr: form.qr || {},
    orders: form.orders || {},
    floor: form.floor || {},
    kitchen: form.kitchen || {},
    discounts: form.discounts || {},
    waiters: form.waiters || {},
    notifications: form.notifications || {},
    security: form.security || {},
    advanced: form.advanced || {},
  }
}

async function replaceChildren(table, restaurantId, rows) {
  const clear = await supabase.from(table).delete().eq('restaurant_id', restaurantId)
  if (clear.error) return clear
  if (!(rows || []).length) return { error: null }
  return supabase.from(table).insert(rows.map(({ id, ...row }) => row))
}

export async function loadRestaurantSettings(restaurant, user) {
  if (!restaurant?.id) return { data: null, error: null }
  const restaurantId = restaurant.id
  const [settings, hours, taxRates, serviceCharges, payments, printers, routes, roles, permissions] = await Promise.all([
    supabase.from('restaurant_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    supabase.from('restaurant_working_hours').select('*').eq('restaurant_id', restaurantId).order('day_of_week'),
    supabase.from('restaurant_tax_rates').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('restaurant_service_charges').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('restaurant_payment_methods').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('restaurant_printer_profiles').select('*').eq('restaurant_id', restaurantId).order('created_at'),
    supabase.from('restaurant_printer_routes').select('*').eq('restaurant_id', restaurantId).order('created_at'),
    supabase.from('restaurant_roles').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('restaurant_role_permissions').select('*').eq('restaurant_id', restaurantId),
  ])
  const routeMissing = String(routes.error?.message || '').toLowerCase().includes('does not exist')
    || String(routes.error?.message || '').toLowerCase().includes('schema cache')
  const firstError = settings.error || hours.error || taxRates.error || serviceCharges.error || payments.error || printers.error || roles.error || permissions.error
    || (routes.error && !routeMissing ? routes.error : null)
  if (firstError) return { data: null, error: friendlySettingsError(firstError) }
  return {
    data: hydrateSettings(restaurant, {
      settings: settings.data,
      hours: hours.data,
      taxRates: taxRates.data,
      serviceCharges: serviceCharges.data,
      payments: payments.data,
      printers: normalizePrinters(printers.data || []),
      printerRoutes: routeMissing ? [] : normalizeRoutes(routes.data || []),
      roles: roles.data,
      permissions: permissions.data,
    }, user),
    error: null,
  }
}

export async function saveRestaurantProfile(userId, restaurant, form) {
  const payload = {
    name: String(form.name || '').trim(),
    phone: String(form.phone || '').trim(),
    address: String(form.address || '').trim(),
    logo_url: form.logo_url || null,
  }
  const { data, error } = await supabase
    .from('restaurants')
    .update(payload)
    .eq('id', restaurant.id)
    .eq('user_id', userId)
    .select()
    .single()
  return { data, error }
}

export async function saveRestaurantSettings(userId, restaurant, form) {
  if (!restaurant?.id) return { data: null, error: { message: 'Create your restaurant first.' } }
  const restaurantId = restaurant.id
  const profile = await saveRestaurantProfile(userId, restaurant, form)
  if (profile.error) return { data: null, error: friendlySettingsError(profile.error) }

  const settings = await supabase.from('restaurant_settings').upsert(scalarPayload(restaurantId, form), { onConflict: 'restaurant_id' })
  if (settings.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(settings.error) }

  const hoursRows = (form.hours?.length ? form.hours : defaultWorkingHours()).map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    restaurant_id: restaurantId,
    day_of_week: row.day_of_week,
    is_open: row.is_open !== false,
    open_time: row.open_time || '11:00',
    close_time: row.close_time || '23:00',
  }))
  const hours = await replaceChildren('restaurant_working_hours', restaurantId, hoursRows)
  if (hours.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(hours.error) }

  const taxRows = (form.taxRates?.length ? form.taxRates : defaultTaxRates()).map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    restaurant_id: restaurantId,
    name: String(row.name || 'Tax').trim() || 'Tax',
    rate: Number(row.rate) || 0,
    is_enabled: row.is_enabled !== false,
    sort_order: index,
  }))
  const taxes = await replaceChildren('restaurant_tax_rates', restaurantId, taxRows)
  if (taxes.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(taxes.error) }

  const chargeRows = (form.serviceCharges?.length ? form.serviceCharges : defaultServiceCharges()).map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    restaurant_id: restaurantId,
    is_enabled: Boolean(row.is_enabled),
    charge_type: row.charge_type === 'fixed' ? 'fixed' : 'percent',
    value: Number(row.value) || 0,
    is_taxable: Boolean(row.is_taxable),
    sort_order: index,
  }))
  const charges = await replaceChildren('restaurant_service_charges', restaurantId, chargeRows)
  if (charges.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(charges.error) }

  const payRows = (form.payments?.length ? form.payments : defaultPaymentMethods()).map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    restaurant_id: restaurantId,
    method: row.method,
    label: row.label || row.method,
    is_enabled: row.is_enabled !== false,
    sort_order: index,
    upi_id: row.method === 'upi' ? String(row.upi_id || '').trim() : '',
    display_name: row.method === 'upi' ? String(row.display_name || '').trim() : '',
    reference_required: Boolean(row.reference_required),
  }))
  const pays = await replaceChildren('restaurant_payment_methods', restaurantId, payRows)
  if (pays.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(pays.error) }

  const printerRows = (form.printers || []).map((row) => ({
    restaurant_id: restaurantId,
    name: String(row.name || 'Printer').trim() || 'Printer',
    printer_type: row.printer_type || 'thermal',
    connection_type: row.connection_type || 'browser',
    paper_width: row.paper_width || '80mm',
    is_active: row.is_active !== false,
    is_default_kot: Boolean(row.is_default_kot),
    is_default_bill: Boolean(row.is_default_bill),
    is_default_receipt: Boolean(row.is_default_receipt),
    is_default_kitchen: Boolean(row.is_default_kitchen),
    use_for: row.use_for || 'kot',
    address: String(row.address || '').trim(),
    host: String(row.host || '').trim(),
    port: String(row.port || '').trim(),
    route_by: row.route_by || 'none',
    route_value: String(row.route_value || '').trim(),
  }))
  let printers = await replaceChildren('restaurant_printer_profiles', restaurantId, printerRows)
  if (printers.error) {
    const text = String(printers.error.message || '').toLowerCase()
    const missingPrintCols = text.includes('use_for') || text.includes('address') || text.includes('host') || text.includes('port') || text.includes('browser') || text.includes('system')
    if (missingPrintCols) {
      const legacyRows = printerRows.map(({ use_for, address, host, port, ...row }) => ({
        ...row,
        connection_type: ['browser', 'system'].includes(row.connection_type) ? 'network' : row.connection_type,
      }))
      printers = await replaceChildren('restaurant_printer_profiles', restaurantId, legacyRows)
    }
  }
  if (printers.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(printers.error) }

  const savedPrinters = await supabase
    .from('restaurant_printer_profiles')
    .select('id, name, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at')
  if (savedPrinters.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(savedPrinters.error) }
  const savedIds = (savedPrinters.data || []).map((row) => row.id)
  const routeRows = (form.printerRoutes || [])
    .filter((row) => row.route_type && String(row.route_value || '').trim() && row.printer_id)
    .map((row) => {
      const index = (form.printers || []).findIndex((item) => item.id === row.printer_id || item._key === row.printer_id)
      const printerId = index >= 0 ? savedIds[index] : row.printer_id
      return {
        restaurant_id: restaurantId,
        printer_id: printerId,
        route_type: row.route_type,
        route_value: String(row.route_value || '').trim(),
      }
    })
    .filter((row) => row.printer_id)
  const routes = await replaceChildren('restaurant_printer_routes', restaurantId, routeRows)
  if (routes.error) {
    const text = String(routes.error.message || '').toLowerCase()
    if (!(text.includes('does not exist') || text.includes('schema cache'))) {
      return { data: null, restaurant: profile.data, error: friendlySettingsError(routes.error) }
    }
  }

  const roleSeed = form.roles?.length ? form.roles : defaultRoles()
  const roleRows = roleSeed.map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    restaurant_id: restaurantId,
    role_key: row.role_key,
    name: row.name,
    is_system: true,
    sort_order: index,
  }))
  const roles = await replaceChildren('restaurant_roles', restaurantId, roleRows)
  if (roles.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(roles.error) }

  const savedRoles = await supabase.from('restaurant_roles').select('id, role_key').eq('restaurant_id', restaurantId)
  if (savedRoles.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(savedRoles.error) }
  const roleIdByKey = Object.fromEntries((savedRoles.data || []).map((row) => [row.role_key, row.id]))
  const permRows = []
  for (const role of roleSeed) {
    const roleId = roleIdByKey[role.role_key]
    if (!roleId) continue
    for (const group of PERMISSION_GROUPS) {
      permRows.push({
        restaurant_id: restaurantId,
        role_id: roleId,
        permission_key: group.id,
        allowed: Boolean(role.permissions?.[group.id]),
      })
    }
  }
  const clearPerms = await supabase.from('restaurant_role_permissions').delete().eq('restaurant_id', restaurantId)
  if (clearPerms.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(clearPerms.error) }
  if (permRows.length) {
    const insertPerms = await supabase.from('restaurant_role_permissions').insert(permRows)
    if (insertPerms.error) return { data: null, restaurant: profile.data, error: friendlySettingsError(insertPerms.error) }
  }

  const loaded = await loadRestaurantSettings(profile.data, { user_metadata: { username: form.owner_name } })
  return {
    data: loaded.data,
    restaurant: applySettingsToRestaurant(profile.data, loaded.data),
    error: loaded.error,
  }
}

export async function loadRestaurantRuntime(restaurant) {
  if (!restaurant?.id) return { data: restaurant || null, error: null }
  const restaurantId = restaurant.id
  const [settings, taxRates, serviceCharges] = await Promise.all([
    supabase.from('restaurant_settings').select('timezone, currency, tax_enabled, tax_mode').eq('restaurant_id', restaurantId).maybeSingle(),
    supabase.from('restaurant_tax_rates').select('name, rate, is_enabled, sort_order').eq('restaurant_id', restaurantId).order('sort_order'),
    supabase.from('restaurant_service_charges').select('is_enabled, charge_type, value').eq('restaurant_id', restaurantId).order('sort_order'),
  ])
  const firstError = settings.error || taxRates.error || serviceCharges.error
  if (firstError || !settings.data) return { data: restaurant, error: null }
  return {
    data: applySettingsToRestaurant(restaurant, {
      timezone: settings.data.timezone,
      currency: settings.data.currency,
      tax_enabled: settings.data.tax_enabled,
      tax_mode: settings.data.tax_mode,
      taxRates: taxRates.data || [],
      serviceCharges: serviceCharges.data || [],
    }),
    error: null,
  }
}
