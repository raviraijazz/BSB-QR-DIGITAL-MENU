import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WAITER_AUTH_EMAIL_DOMAIN = 'waiter.bsbdigitalmenu.local'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function diag(event: string, extra: Record<string, unknown> = {}) {
  try {
    console.info('[manage-waiter-password]', { event, ...extra })
  } catch {
    /* ignore */
  }
}

function expectedWaiterEmail(waiterId: string) {
  return `${String(waiterId || '').trim().toLowerCase()}@${WAITER_AUTH_EMAIL_DOMAIN}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  let publishableKeys: Record<string, unknown> = {}
  let secretKeys: Record<string, unknown> = {}
  try {
    publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
  } catch {
    publishableKeys = {}
  }
  try {
    secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  } catch {
    secretKeys = {}
  }
  const anonKey = typeof publishableKeys.default === 'string' ? publishableKeys.default : ''
  const serviceKey = typeof secretKeys.default === 'string' ? secretKeys.default : ''
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
  if (!profile || profile.role !== 'owner') {
    return json({ error: 'Only restaurant owners can change waiter passwords.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }

  const restaurantId = String(payload.restaurant_id || '')
  if (!UUID_RE.test(restaurantId)) return json({ error: 'Restaurant required' }, 400)

  const waiterRecordId = String(payload.waiter_record_id || '')
  if (!UUID_RE.test(waiterRecordId)) return json({ error: 'Waiter required' }, 400)

  const password = String(payload.new_password || payload.password || '')
  const confirmPassword = payload.confirm_password ?? payload.new_password_confirm
  if (!password) return json({ error: 'Password is required' }, 400)
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)
  if (confirmPassword !== undefined && confirmPassword !== null && String(confirmPassword) !== password) {
    return json({ error: 'Passwords do not match' }, 400)
  }

  const { data: restaurant } = await admin
    .from('restaurants')
    .select('id, user_id')
    .eq('id', restaurantId)
    .maybeSingle()
  if (!restaurant || restaurant.user_id !== ownerId) {
    return json({ error: 'This restaurant does not belong to your account.' }, 403)
  }

  const { data: waiter } = await admin
    .from('waiters')
    .select('id, restaurant_id, waiter_id, auth_user_id')
    .eq('id', waiterRecordId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!waiter) {
    return json({ error: 'Waiter not found for this restaurant.' }, 404)
  }
  if (!waiter.auth_user_id) {
    return json({ error: 'This waiter does not have a login yet. Enable Login first.' }, 400)
  }

  const authUserId = String(waiter.auth_user_id)
  const expectedEmail = expectedWaiterEmail(String(waiter.waiter_id || ''))
  diag('start', {
    waiter_record_id: waiter.id,
    waiter_id: waiter.waiter_id,
    restaurant_id: restaurantId,
    auth_user_id: authUserId,
    expected_email: expectedEmail,
  })

  const { data: beforeData, error: beforeError } = await admin.auth.admin.getUserById(authUserId)
  const beforeUser = beforeData?.user
  if (beforeError || !beforeUser) {
    diag('auth-user-missing', {
      waiter_record_id: waiter.id,
      auth_user_id: authUserId,
      found: false,
    })
    return json({ error: 'Waiter login account was not found. Contact support.' }, 404)
  }
  if (!beforeUser.email) {
    diag('auth-email-missing', {
      waiter_record_id: waiter.id,
      auth_user_id: authUserId,
      found: true,
    })
    return json({ error: 'Waiter login email is missing. Contact support.' }, 400)
  }

  const beforeEmail = String(beforeUser.email).trim().toLowerCase()
  const emailMatches = beforeEmail === expectedEmail
  diag('auth-user-found', {
    waiter_record_id: waiter.id,
    waiter_id: waiter.waiter_id,
    restaurant_id: restaurantId,
    auth_user_id: authUserId,
    expected_email: expectedEmail,
    found: true,
    email_matches: emailMatches,
    email_confirmed: Boolean(beforeUser.email_confirmed_at),
  })

  if (!emailMatches) {
    const { error: emailError } = await admin.auth.admin.updateUserById(authUserId, {
      email: expectedEmail,
      email_confirm: true,
    })
    diag('email-resync', {
      waiter_record_id: waiter.id,
      auth_user_id: authUserId,
      expected_email: expectedEmail,
      success: !emailError,
      error_category: emailError ? 'update_email_failed' : 'ok',
    })
    if (emailError) {
      return json({ error: 'Could not sync waiter login email.' }, 400)
    }
  }

  const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
    password,
    email: expectedEmail,
    email_confirm: true,
  })
  diag('password-update', {
    waiter_record_id: waiter.id,
    waiter_id: waiter.waiter_id,
    restaurant_id: restaurantId,
    auth_user_id: authUserId,
    expected_email: expectedEmail,
    success: !updateError,
    error_category: updateError ? 'update_password_failed' : 'ok',
    updated_user_id: updatedData?.user?.id || null,
    same_auth_user: updatedData?.user?.id === authUserId,
  })
  if (updateError) return json({ error: 'Could not update waiter password.' }, 400)
  if (!updatedData?.user?.id || updatedData.user.id !== authUserId) {
    return json({ error: 'Could not update waiter password.' }, 400)
  }

  const { data: afterData, error: afterError } = await admin.auth.admin.getUserById(authUserId)
  const afterUser = afterData?.user
  if (afterError || !afterUser || afterUser.id !== authUserId) {
    diag('verify-failed', {
      waiter_record_id: waiter.id,
      auth_user_id: authUserId,
      found: Boolean(afterUser),
    })
    return json({ error: 'Password update could not be verified.' }, 400)
  }
  const afterEmail = String(afterUser.email || '').trim().toLowerCase()
  const confirmed = Boolean(afterUser.email_confirmed_at)
  diag('verify', {
    waiter_record_id: waiter.id,
    waiter_id: waiter.waiter_id,
    restaurant_id: restaurantId,
    auth_user_id: authUserId,
    expected_email: expectedEmail,
    found: true,
    email_matches: afterEmail === expectedEmail,
    email_confirmed: confirmed,
  })
  if (afterEmail !== expectedEmail) {
    return json({ error: 'Waiter login email could not be verified.' }, 400)
  }
  if (!confirmed) {
    return json({ error: 'Waiter login email is not confirmed.' }, 400)
  }

  return json({
    success: true,
    waiter_id: waiter.waiter_id,
  })
})
