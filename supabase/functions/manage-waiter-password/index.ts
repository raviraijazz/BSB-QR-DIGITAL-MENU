import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

  const password = String(payload.password || '')
  if (!password) return json({ error: 'Password is required' }, 400)
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)

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
    .select('id, restaurant_id, auth_user_id')
    .eq('id', waiterRecordId)
    .maybeSingle()
  if (!waiter || waiter.restaurant_id !== restaurantId) {
    return json({ error: 'Waiter not found for this restaurant.' }, 404)
  }
  if (!waiter.auth_user_id) {
    return json({ error: 'This waiter does not have a login yet. Enable Login first.' }, 400)
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(waiter.auth_user_id, {
    password,
  })
  if (updateError) return json({ error: 'Could not update waiter password.' }, 400)

  return json({ ok: true })
})
