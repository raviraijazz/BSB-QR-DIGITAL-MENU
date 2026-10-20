// BSB Digital Menu — Phase 22 Founder Console API
// Every privileged action is authorized server-side against the
// platform_admins allowlist. Service-role keys never reach the browser.
//
// SELF-CONTAINED: safe to paste into the Supabase Dashboard function editor.
// It imports nothing but the Supabase JS client from esm.sh, so there is no
// sibling ../_shared file to resolve.
//
// Dashboard settings for this function:
//   Verify JWT = ON
//   Entry point: index.ts (this file)
//
// First-login gate (server-enforced): a founder provisioned with a temporary
// password may only call whoami and change_password. Every other action is
// rejected with 403 until Supabase Auth accepts a new password and the
// must_change_password flag is cleared.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_PAGE_SIZE = 100

// ---------------------------------------------------------------------------
// First-login password gate (inlined so this file is self-contained).
// ---------------------------------------------------------------------------
const FOUNDER_PASSWORD_MIN_LENGTH = 10
const FOUNDER_LOCKED_ACTIONS = ['whoami', 'change_password']

function isFounderActionAllowed(action: string, mustChangePassword: boolean) {
  if (!mustChangePassword) return true
  return FOUNDER_LOCKED_ACTIONS.includes(String(action || ''))
}

function passwordClasses(password: string) {
  return [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length
}

function validateNewFounderPassword(
  newPassword: string,
  confirmPassword: string,
  currentPassword = '',
) {
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

// ---------------------------------------------------------------------------
// Response / key helpers
// ---------------------------------------------------------------------------
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
  if (/export\?format=csv/i.test(url) || /tqx=out:csv/i.test(url)) return url
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return null
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`
}

function sheetCsvCandidates(url: string): string[] {
  const exportUrl = toSheetCsvUrl(url)
  if (!exportUrl) return []
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  const urls = [exportUrl]
  if (match?.[1] && !/tqx=out:csv/i.test(exportUrl)) {
    urls.push(`https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&gid=${gid}`)
  }
  return [...new Set(urls)]
}

function looksLikeHtml(text: string) {
  const head = String(text || '').trim().slice(0, 200).toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<head')
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

      // A password change through the Admin API revokes every existing refresh
      // token, which would leave this browser unable to refresh its session.
      // Mint a fresh session with the new password so the client can continue
      // without a re-login. The password is used once, in memory only; it is
      // never stored, logged or returned.
      let freshSession: { access_token: string; refresh_token: string } | null = null
      try {
        const authClient = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data: signedIn } = await authClient.auth.signInWithPassword({
          email: actor.email,
          password: newPassword,
        })
        if (signedIn?.session?.access_token) {
          freshSession = {
            access_token: signedIn.session.access_token,
            refresh_token: signedIn.session.refresh_token,
          }
        }
      } catch {
        freshSession = null
      }

      await audit('change_password', null, { forced: mustChange })
      return json({ ok: true, must_change_password: false, session: freshSession })
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
      const candidates = sheetCsvCandidates(url)
      if (!candidates.length) return json({ error: 'Could not build a CSV export URL from that link.' }, 400)
      let rows: string[][] = []
      let lastStatus = 0
      let sawHtml = false
      for (const exportUrl of candidates) {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 15000)
          const res = await fetch(exportUrl, { signal: controller.signal, redirect: 'follow' })
          clearTimeout(timer)
          lastStatus = res.status
          if (!res.ok) continue
          const text = await res.text()
          if (!String(text || '').trim()) continue
          if (looksLikeHtml(text)) {
            sawHtml = true
            continue
          }
          rows = parseCsv(text)
          if (rows.length) break
        } catch {
          // try the next CSV export URL
        }
      }
      if (!rows.length) {
        if (sawHtml || lastStatus === 401 || lastStatus === 403) {
          return json({ error: 'The sheet is not publicly readable. Share it to anyone with the link, or upload a CSV export.' }, 400)
        }
        if (lastStatus && lastStatus !== 200) {
          return json({ error: `Sheet fetch failed (HTTP ${lastStatus}). Is it shared publicly?` }, 400)
        }
        return json({ error: 'The sheet appears to be empty. Upload a CSV export if it is private.' }, 400)
      }
      return json({ rows })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch {
    return json({ error: 'Unexpected server error.' }, 500)
  }
})
