// BSB Digital Menu — Founder Console bootstrap / password rotation
// =========================================================================
// Protected, NON-PUBLIC endpoint. It is disabled unless the operator sets a
// strong PLATFORM_ADMIN_SETUP_SECRET in the function environment, and every
// call must present that secret in the x-setup-secret header.
//
// It provisions the founder's Supabase Auth account through the Admin Auth API
// using a synthetic internal email, with email_confirm: true so no email
// verification / OTP / magic link is ever required. The founder types only a
// username + password. Passwords are never written to any application table.
//
// USAGE (run once to create the founder, or again to rotate the password):
//   curl -X POST "$SUPABASE_URL/functions/v1/platform-admin-setup" \
//     -H "Content-Type: application/json" \
//     -H "x-setup-secret: $PLATFORM_ADMIN_SETUP_SECRET" \
//     -d '{"username":"founder","password":"a-strong-passphrase"}'
//
// Deploy with: supabase functions deploy platform-admin-setup
// Set the secret with: supabase secrets set PLATFORM_ADMIN_SETUP_SECRET=...
// After bootstrap you may unset the secret to fully disable this endpoint.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-setup-secret',
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/
const MIN_PASSWORD_LENGTH = 8
const AUTH_EMAIL_DOMAIN = 'platform.bsbdigitalmenu.local'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeUsername(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function platformAuthEmail(username: string) {
  return `${username}@${AUTH_EMAIL_DOMAIN}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const setupSecret = Deno.env.get('PLATFORM_ADMIN_SETUP_SECRET') || ''
  // Disabled (not just unauthorized) until the operator configures a secret.
  if (setupSecret.length < 16) return json({ error: 'Not found' }, 404)
  const provided = req.headers.get('x-setup-secret') || ''
  if (provided !== setupSecret) return json({ error: 'Not found' }, 404)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  let secretKeys: Record<string, unknown> = {}
  try {
    secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  } catch {
    secretKeys = {}
  }
  const serviceKey = typeof secretKeys.default === 'string' ? secretKeys.default : ''
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is not configured' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let payload: Record<string, unknown> = {}
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  const username = normalizeUsername(payload.username)
  const password = String(payload.password || '')
  const notes = String(payload.notes || 'Founder').slice(0, 200)

  if (!USERNAME_RE.test(username)) {
    return json({ error: 'Username must be 3–24 letters, numbers or underscores' }, 400)
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
  }

  const email = platformAuthEmail(username)

  const { data: existing } = await admin
    .from('platform_admins')
    .select('user_id, username')
    .eq('username', username)
    .maybeSingle()

  // Rotate an existing founder's password (no email/OTP involved).
  if (existing?.user_id) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.user_id, {
      password,
      email,
      email_confirm: true,
      user_metadata: { role: 'platform_admin', username },
    })
    if (updateError) {
      return json({ error: updateError.message || 'Could not update founder password.' }, 400)
    }
    await admin.from('platform_admins').update({ email, notes }).eq('user_id', existing.user_id)
    return json({ ok: true, created: false, updated: true, user_id: existing.user_id })
  }

  // Create the founder auth user (auto-confirmed synthetic email).
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'platform_admin', username },
  })
  if (createError || !created.user) {
    const text = String(createError?.message || '').toLowerCase()
    if (text.includes('already') || text.includes('registered')) {
      return json(
        {
          error:
            'An auth user already exists for this username but is not linked in platform_admins. ' +
            'Remove the orphan auth user or insert its platform_admins row, then retry.',
        },
        409,
      )
    }
    return json({ error: createError?.message || 'Could not create founder account.' }, 400)
  }

  const { error: allowError } = await admin.from('platform_admins').insert({
    user_id: created.user.id,
    username,
    email,
    notes,
  })
  if (allowError) {
    await admin.auth.admin.deleteUser(created.user.id)
    const text = String(allowError.message || '').toLowerCase()
    if (text.includes('duplicate') || text.includes('unique')) {
      return json({ error: 'This founder username is already in use.' }, 409)
    }
    return json({ error: 'Could not grant platform-admin access.' }, 400)
  }

  return json({ ok: true, created: true, user_id: created.user.id })
})
