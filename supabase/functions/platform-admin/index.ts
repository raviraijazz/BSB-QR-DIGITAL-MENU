// BSB Digital Menu — Phase 22 Founder Console API
// Every privileged action is authorized server-side against the
// platform_admins allowlist. Service-role keys never reach the browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = parseKeys(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')).default as string | undefined
  const serviceKey = parseKeys(Deno.env.get('SUPABASE_SECRET_KEYS')).default as string | undefined
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
    .select('user_id, username, email')
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
      user: {
        id: actor.id,
        // Never expose the synthetic internal auth email to the client.
        username: allow?.username || profile?.username || '',
      },
    })
  }

  if (!allow) return json({ error: 'Platform admin access required.' }, 403)

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
      const currentPassword = String(payload.current_password || '')
      const newPassword = String(payload.new_password || '')
      if (!currentPassword || !newPassword) {
        return json({ error: 'Current and new password are required.' }, 400)
      }
      if (newPassword.length < 8) {
        return json({ error: 'New password must be at least 8 characters.' }, 400)
      }
      if (newPassword === currentPassword) {
        return json({ error: 'New password must be different from the current password.' }, 400)
      }
      if (!actor.email) {
        return json({ error: 'Password change is unavailable for this account.' }, 400)
      }
      // Verify the current password before rotating. No email/OTP is involved.
      const { error: verifyError } = await userClient.auth.signInWithPassword({
        email: actor.email,
        password: currentPassword,
      })
      if (verifyError) return json({ error: 'Current password is incorrect.' }, 400)
      const { error: updateError } = await admin.auth.admin.updateUserById(actor.id, { password: newPassword })
      if (updateError) return json({ error: 'Could not update password.' }, 400)
      await audit('change_password', null, {})
      return json({ ok: true })
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
      await audit('view_restaurant', id, { name: row.name })
      return json({ restaurant })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch {
    return json({ error: 'Unexpected server error.' }, 500)
  }
})
