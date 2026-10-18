// BSB Digital Menu — Phase 22 Founder Console API
// Every privileged action is authorized server-side against the
// platform_admins allowlist. Service-role keys never reach the browser.
//
// DEPLOY WITH THE SUPABASE CLI FROM THE REPOSITORY ROOT:
//   supabase functions deploy platform-admin
// This function imports the sibling ../_shared/founder-gate.js. The CLI bundles
// that shared file automatically; the Dashboard single-file editor cannot, and
// fails with "Module not found .../_shared/founder-gate.js".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isFounderActionAllowed, validateNewFounderPassword } from '../_shared/founder-gate.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_PAGE_SIZE = 100

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseKeys(raw: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

// New projects expose SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS as JSON;
// older projects expose SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
function resolveAnonKey() {
  const keys = parseKeys(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))
  if (typeof keys.default === 'string' && keys.default) return keys.default
  return Deno.env.get('SUPABASE_ANON_KEY') || ''
}

function resolveServiceKey() {
  const keys = parseKeys(Deno.env.get('SUPABASE_SECRET_KEYS'))
  if (typeof keys.default === 'string' && keys.default) return keys.default
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

function toSheetCsvUrl(url: string): string | null {
  if (/export\?format=csv/i.test(url)) return url
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return null
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const source = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = resolveAnonKey()
  const serviceKey = resolveServiceKey()
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Founder Console backend is not configured.' }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)
  const actor = userData.user

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: allow } = await admin
    .from('platform_admins')
    .select('user_id, username, email, must_change_password')
    .eq('user_id', actor.id)
    .maybeSingle()

  let payload: Record<string, unknown> = {}
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }
  const action = String(payload.action || 'whoami')

  // whoami is the only action allowed to report non-admin status.
  if (action === 'whoami') {
    const { data: profile } = await admin
      .from('profiles')
      .select('username, role')
      .eq('id', actor.id)
      .maybeSingle()
    return json({
      isAdmin: Boolean(allow),
      mustChangePassword: Boolean(allow?.must_change_password),
      user: {
        id: actor.id,
        // Never expose the synthetic internal auth email to the client.
        username: allow?.username || profile?.username || '',
      },
    })
  }

  if (!allow) return json({ error: 'Platform admin access required.' }, 403)

  // First-login gate, enforced server-side. A founder provisioned with a
  // temporary password may only inspect whoami and rotate that password; every
  // other privileged action is rejected until the flag is cleared.
  if (!isFounderActionAllowed(action, Boolean(allow.must_change_password))) {
    return json(
      {
        error: 'Password change required before using the Founder Console.',
        code: 'password_change_required',
      },
      403,
    )
  }

  async function audit(name: string, targetRestaurantId: string | null, details: Record<string, unknown> = {}) {
    await admin.from('platform_audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email || allow?.email || '',
      action: name,
      target_restaurant_id: targetRestaurantId,
      details,
    })
  }

  try {
    if (action === 'change_password') {
      const mustChange = Boolean(allow.must_change_password)
      const currentPassword = String(payload.current_password || '')
      const newPassword = String(payload.new_password || '')
      const confirmPassword = String(payload.confirm_password || '')

      if (mustChange) {
        // Forced first-login flow: the founder just authenticated with the
        // temporary password, so a current-password prompt is optional. A
        // supplied current password is still verified below.
        const validation = validateNewFounderPassword(newPassword, confirmPassword)
        if (validation) return json({ error: validation }, 400)
      } else {
        if (!currentPassword) return json({ error: 'Current password is required.' }, 400)
        const validation = validateNewFounderPassword(newPassword, confirmPassword, currentPassword)
        if (validation) return json({ error: validation }, 400)
      }

      if (!actor.email) {
        return json({ error: 'Password change is unavailable for this account.' }, 400)
      }

      // Verify any supplied current password. No email/OTP is involved.
      if (currentPassword) {
        const { error: verifyError } = await userClient.auth.signInWithPassword({
          email: actor.email,
          password: currentPassword,
        })
        if (verifyError) return json({ error: 'Current password is incorrect.' }, 400)
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(actor.id, {
        password: newPassword,
      })
      if (updateError) return json({ error: 'Could not update password.' }, 400)

      // Clear the gate only AFTER Supabase Auth accepted the new password.
      const { error: flagError } = await admin
        .from('platform_admins')
        .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
        .eq('user_id', actor.id)
      if (flagError) {
        return json(
          {
            error:
              'Password was updated but the first-login flag could not be cleared. Retry the change.',
          },
          500,
        )
      }

      await audit('change_password', null, { forced: mustChange })
      return json({ ok: true, must_change_password: false })
    }

    if (action === 'overview') {
      const to = payload.to ? new Date(String(payload.to)) : new Date()
      const from = payload.from ? new Date(String(payload.from)) : new Date(to.getTime() - 30 * 86400000)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return json({ error: 'Invalid date range.' }, 400)
      }
      const { data, error } = await admin.rpc('platform_overview', {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      })
      if (error) return json({ error: 'Could not load platform metrics.' }, 500)
      const row = Array.isArray(data) ? data[0] : data
      return json({ from: from.toISOString(), to: to.toISOString(), metrics: row || null })
    }

    if (action === 'restaurants') {
      const page = Math.max(1, Number(payload.page) || 1)
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(payload.pageSize) || 20))
      const search = String(payload.search || '').trim()
      const status = String(payload.status || '').trim()
      const { data, error } = await admin.rpc('platform_restaurants', {
        p_search: search,
        p_status: status,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })
      if (error) return json({ error: 'Could not load the restaurant directory.' }, 500)
      const rows = Array.isArray(data) ? data : []
      const total = rows.length ? Number(rows[0].total_count) : 0

      const ids = rows.map((row) => row.id).filter(Boolean)
      const typeById: Record<string, string> = {}
      if (ids.length) {
        const settings = await admin
          .from('restaurant_settings')
          .select('restaurant_id, restaurant_type')
          .in('restaurant_id', ids)
        for (const item of settings.data || []) {
          typeById[item.restaurant_id] = item.restaurant_type || ''
        }
      }
      const items = rows.map(({ total_count: _total, ...row }) => ({
        ...row,
        restaurant_type: typeById[row.id] || '',
      }))
      return json({ items, total, page, pageSize })
    }

    if (action === 'restaurant') {
      const id = String(payload.id || '')
      if (!id) return json({ error: 'Restaurant id required.' }, 400)
      const { data, error } = await admin.rpc('platform_restaurant_detail', { p_id: id })
      if (error) return json({ error: 'Could not load this restaurant.' }, 500)
      const row = Array.isArray(data) ? data[0] : data
      if (!row) return json({ error: 'Restaurant not found.' }, 404)
      const { data: settings } = await admin
        .from('restaurant_settings')
        .select('restaurant_type')
        .eq('restaurant_id', id)
        .maybeSingle()
      const restaurant = { ...row, restaurant_type: settings?.restaurant_type || '' }

      // Account directory for the Manage Access panel.
      const { data: ownerProfile } = await admin
        .from('profiles')
        .select('id, username, role, is_blocked')
        .eq('id', restaurant.owner_id)
        .maybeSingle()
      const { data: waiterRows } = await admin
        .from('waiters')
        .select('id, auth_user_id, waiter_id, full_name, is_active, is_blocked')
        .eq('restaurant_id', id)
        .order('full_name')

      await audit('view_restaurant', id, { name: row.name })
      return json({
        restaurant: {
          ...restaurant,
          owner: ownerProfile || null,
          waiters: waiterRows || [],
        },
      })
    }

    if (action === 'fetch_sheet') {
      const url = String(payload.url || '').trim()
      if (!/^https:\/\//i.test(url)) {
        return json({ error: 'A valid https spreadsheet URL is required.' }, 400)
      }
      const allowedHost = /^https:\/\/(docs\.google\.com|drive\.google\.com|docs\.googleusercontent\.com)\//i.test(url)
      if (!allowedHost) {
        return json({ error: 'Only Google Sheets URLs are supported for direct fetch. Upload a CSV file instead.' }, 400)
      }
      const exportUrl = toSheetCsvUrl(url)
      if (!exportUrl) return json({ error: 'Could not build a CSV export URL from that link.' }, 400)
      let text = ''
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 15000)
        const res = await fetch(exportUrl, { signal: controller.signal, redirect: 'follow' })
        clearTimeout(timer)
        if (!res.ok) return json({ error: `Sheet fetch failed (HTTP ${res.status}). Is it shared publicly?` }, 400)
        text = await res.text()
      } catch {
        return json({ error: 'Could not reach the sheet. Ensure it is shared publicly or upload a CSV file.' }, 400)
      }
      const rows = parseCsv(text)
      if (!rows.length) return json({ error: 'The sheet appears to be empty.' }, 400)
      return json({ rows })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch {
    return json({ error: 'Unexpected server error.' }, 500)
  }
})
