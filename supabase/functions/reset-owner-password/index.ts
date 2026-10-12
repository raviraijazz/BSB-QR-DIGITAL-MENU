import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIN_PASSWORD_LENGTH = 8

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
    return json({ error: 'Only the restaurant owner can reset this password.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }

  const password = String(payload.new_password || payload.password || '')
  const confirmPassword = payload.confirm_password ?? payload.new_password_confirm
  if (!password) return json({ error: 'New password required' }, 400)
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
  }
  if (confirmPassword !== undefined && confirmPassword !== null && String(confirmPassword) !== password) {
    return json({ error: 'Passwords do not match' }, 400)
  }

  const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(ownerId, {
    password,
  })
  if (updateError) return json({ error: 'Could not update password.' }, 400)
  if (!updatedData?.user?.id || updatedData.user.id !== ownerId) {
    return json({ error: 'Could not update password.' }, 400)
  }

  return json({ success: true })
})
