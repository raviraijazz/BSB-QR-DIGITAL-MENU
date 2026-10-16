// BSB Digital Menu — Founder Console authentication (server-side username map)
// ==========================================================================
// The founder types ONLY a username + password. This endpoint maps the
// username to the synthetic internal auth address
//   <username>@platform.bsbdigitalmenu.local
// entirely server-side, performs the Supabase Auth password sign-in, verifies
// the resulting user id is present in public.platform_admins, and returns the
// session. The synthetic email, the allowlist and the service key never reach
// the browser.
//
// verify_jwt is false because the founder has no session yet. Authorization is
// still enforced: a valid session is only returned to an allow-listed admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/
const AUTH_EMAIL_DOMAIN = 'platform.bsbdigitalmenu.local'

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

  let payload: Record<string, unknown> = {}
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  const username = String(payload.username || '').trim().toLowerCase()
  const password = String(payload.password || '')
  if (!USERNAME_RE.test(username) || !password) {
    return json({ error: 'Invalid username or password' }, 401)
  }

  const email = `${username}@${AUTH_EMAIL_DOMAIN}`

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({ email, password })
  if (signInError || !signIn.session || !signIn.user) {
    return json({ error: 'Invalid username or password' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: allow } = await admin
    .from('platform_admins')
    .select('user_id, username')
    .eq('user_id', signIn.user.id)
    .maybeSingle()

  if (!allow) {
    // Do not leak a usable session to a non-admin.
    await admin.auth.admin.signOut(signIn.session.access_token).catch(() => {})
    return json({ error: 'You are not authorized to access the Platform Admin Panel.' }, 403)
  }

  await admin.from('platform_audit_log').insert({
    actor_id: signIn.user.id,
    actor_email: '',
    actor_username: allow.username || username,
    action: 'founder_login',
    details: {},
  })

  return json({
    session: {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    },
    user: { id: signIn.user.id, username: allow.username || username },
  })
})
