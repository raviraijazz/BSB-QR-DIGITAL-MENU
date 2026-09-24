import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WAITER_ID_RE = /^[A-Za-z0-9_]{3,24}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sanitizeWaiterId(value: unknown) {
  return String(value || '').trim()
}

function sanitizeFullName(value: unknown) {
  return String(value || '').trim()
}

function waiterAuthEmail(waiterId: string) {
  return `${waiterId.toLowerCase()}@waiter.bsbdigitalmenu.local`
}

function profileUsernameFromAuthId(id: string) {
  return `w${id.replace(/-/g, '').slice(0, 23)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server is not configured' }, 500)

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)
  const ownerId = userData.user.id

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile } = await admin.from('profiles').select('id, role').eq('id', ownerId).maybeSingle()
  if (!profile || profile.role !== 'owner') return json({ error: 'Only restaurant owners can create waiter logins.' }, 403)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }

  const restaurantId = String(payload.restaurant_id || '')
  if (!UUID_RE.test(restaurantId)) return json({ error: 'Restaurant required' }, 400)

  const { data: restaurant } = await admin
    .from('restaurants')
    .select('id, user_id')
    .eq('id', restaurantId)
    .maybeSingle()
  if (!restaurant || restaurant.user_id !== ownerId) {
    return json({ error: 'This restaurant does not belong to your account.' }, 403)
  }

  const waiterRecordId = payload.waiter_record_id ? String(payload.waiter_record_id) : ''
  if (waiterRecordId && !UUID_RE.test(waiterRecordId)) return json({ error: 'Waiter required' }, 400)

  const password = String(payload.password || '')
  if (!password) return json({ error: 'Password required' }, 400)
  if (password.length < 6) return json({ error: 'Password too short' }, 400)

  let fullName = sanitizeFullName(payload.full_name)
  let waiterId = sanitizeWaiterId(payload.waiter_id)
  let isActive = payload.is_active !== false
  let existingWaiter: { id: string; restaurant_id: string; waiter_id: string; full_name: string; auth_user_id: string | null; is_active: boolean } | null = null

  if (waiterRecordId) {
    const { data } = await admin
      .from('waiters')
      .select('id, restaurant_id, waiter_id, full_name, auth_user_id, is_active')
      .eq('id', waiterRecordId)
      .maybeSingle()
    if (!data || data.restaurant_id !== restaurantId) return json({ error: 'Waiter not found for this restaurant.' }, 404)
    if (data.auth_user_id) return json({ error: 'This waiter already has a login.' }, 409)
    existingWaiter = data
    fullName = data.full_name
    waiterId = data.waiter_id
    isActive = data.is_active !== false
  } else {
    if (!fullName) return json({ error: 'Full name required' }, 400)
    if (fullName.length > 80) return json({ error: 'Full name is too long' }, 400)
    if (!waiterId) return json({ error: 'Waiter ID required' }, 400)
    if (!WAITER_ID_RE.test(waiterId)) return json({ error: 'Waiter ID must be 3–24 letters, numbers or underscores' }, 400)

    const { data: taken } = await admin
      .from('waiters')
      .select('id')
      .ilike('waiter_id', waiterId)
      .maybeSingle()
    if (taken) return json({ error: 'This waiter ID is already in use.' }, 409)
  }

  const email = waiterAuthEmail(waiterId)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'waiter',
      waiter_id: waiterId,
      restaurant_id: restaurantId,
      full_name: fullName,
    },
  })

  if (createError || !created.user) {
    const text = String(createError?.message || '').toLowerCase()
    if (text.includes('already') || text.includes('registered')) {
      return json({ error: 'This waiter ID is already in use.' }, 409)
    }
    return json({ error: createError?.message || 'Could not create waiter login' }, 400)
  }

  const authUserId = created.user.id
  const username = profileUsernameFromAuthId(authUserId)

  const { error: profileError } = await admin.from('profiles').insert({
    id: authUserId,
    username,
    role: 'waiter',
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(authUserId)
    const text = String(profileError.message || '').toLowerCase()
    if (text.includes('duplicate') || text.includes('unique')) {
      return json({ error: 'This waiter ID is already in use.' }, 409)
    }
    return json({ error: 'Could not create waiter profile' }, 400)
  }

  let waiterRow = null
  if (existingWaiter) {
    const { data, error } = await admin
      .from('waiters')
      .update({ auth_user_id: authUserId })
      .eq('id', existingWaiter.id)
      .eq('restaurant_id', restaurantId)
      .is('auth_user_id', null)
      .select('id, restaurant_id, waiter_id, full_name, is_active, auth_user_id, created_at')
      .single()
    if (error || !data) {
      await admin.from('profiles').delete().eq('id', authUserId)
      await admin.auth.admin.deleteUser(authUserId)
      return json({ error: error?.message || 'Could not link waiter login' }, 400)
    }
    waiterRow = data
  } else {
    const { data, error } = await admin
      .from('waiters')
      .insert({
        auth_user_id: authUserId,
        restaurant_id: restaurantId,
        waiter_id: waiterId,
        full_name: fullName,
        is_active: isActive,
      })
      .select('id, restaurant_id, waiter_id, full_name, is_active, auth_user_id, created_at')
      .single()
    if (error || !data) {
      await admin.from('profiles').delete().eq('id', authUserId)
      await admin.auth.admin.deleteUser(authUserId)
      const text = String(error?.message || '').toLowerCase()
      if (text.includes('duplicate') || text.includes('unique')) {
        return json({ error: 'This waiter ID is already in use.' }, 409)
      }
      if (text.includes('auth_user_id') && text.includes('null')) {
        return json({ error: 'Waiter records need a database update. Run supabase/waiters-nullable-auth.sql in the SQL Editor.' }, 400)
      }
      return json({ error: error?.message || 'Could not create waiter' }, 400)
    }
    waiterRow = data
  }

  return json({
    waiter: waiterRow,
  })
})
