// BSB Digital Menu — Founder Console bootstrap / password rotation
// =========================================================================
// Protected, NON-PUBLIC endpoint. It is disabled unless the operator sets
// PLATFORM_ADMIN_SETUP_SECRET in the function secrets, and every call must
// present that secret in the `x-setup-secret` header.
//
// ROUTING: this handler serves the deployed function ROOT
//   POST {SUPABASE_URL}/functions/v1/platform-admin-setup
// Deno.serve() receives every sub-path too, so a trailing slash also works.
//
// STATUS CODES (no secret value is ever echoed):
//   200 bootstrap/rotation succeeded
//   400 invalid username/password body
//   401 missing or invalid x-setup-secret
//   405 method not allowed (only POST; OPTIONS is CORS preflight)
//   409 username already linked / orphan auth user conflict
//   500 server not configured (missing SUPABASE_URL or service key)
//   502 Supabase Auth/DB rejected the operation
//   503 endpoint disabled (PLATFORM_ADMIN_SETUP_SECRET not set)
//
// It provisions the founder's Supabase Auth account through the Admin Auth API
// using a synthetic internal email, with email_confirm: true so no email
// verification / OTP / magic link is ever required. The founder types only a
// username + password. Passwords are never written to any application table
// and are never logged or returned.
//
// Every provisioned/rotated account is created with must_change_password = true,
// so the founder must set a new password on first login before any privileged
// action is allowed. The flag is only cleared by the platform-admin
// change_password action after Supabase Auth accepts the new password.
//
// After the first successful bootstrap, retire this endpoint:
//   supabase secrets unset PLATFORM_ADMIN_SETUP_SECRET
// (and optionally redeploy). A new username is also refused while any admin
// exists unless the request explicitly includes "allow_new": true.
//
// USAGE (run once to create the founder, or again to rotate the password):
//   curl -i -X POST "$SUPABASE_URL/functions/v1/platform-admin-setup" \
//     -H "Content-Type: application/json" \
//     -H "x-setup-secret: $PLATFORM_ADMIN_SETUP_SECRET" \
//     -d '{"username":"founder","password":"a-strong-passphrase"}'
//
// Deploy:      supabase functions deploy platform-admin-setup
// Set secret:  supabase secrets set PLATFORM_ADMIN_SETUP_SECRET=...
// Disable:     supabase secrets unset PLATFORM_ADMIN_SETUP_SECRET
// Redeploy after changing this file: `supabase functions deploy ...`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-setup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// Usernames allow `_`, which is a single-character wildcard in SQL LIKE, so
// escape LIKE metacharacters before using an ilike lookup. This keeps the
// case-insensitive match safe for legacy mixed-case rows.
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// Constant-time-ish comparison so the response timing does not reveal how much
// of the secret matched. Never logs or returns either value.
function secretsMatch(provided: string, expected: string) {
  const a = new TextEncoder().encode(provided)
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

// New projects expose SUPABASE_SECRET_KEYS (JSON). Older/Dashboard-created
// projects still expose SUPABASE_SERVICE_ROLE_KEY. Support both.
function resolveServiceKey() {
  try {
    const parsed = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    if (typeof parsed.default === 'string' && parsed.default) return parsed.default
  } catch {
    /* fall through */
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

function looksLikeMissingUser(message: string) {
  const text = message.toLowerCase()
  return text.includes('not found') || text.includes('does not exist') || text.includes('no user')
}

function looksLikeDuplicate(message: string) {
  const text = message.toLowerCase()
  return text.includes('already') || text.includes('registered') || text.includes('duplicate') || text.includes('unique')
}

Deno.serve(async (req) => {
  // Any path under the function root reaches this handler; the root endpoint is
  // the intended target. We do not require a sub-route.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    })
  }

  const setupSecret = (Deno.env.get('PLATFORM_ADMIN_SETUP_SECRET') || '').trim()
  if (!setupSecret) {
    return json(
      {
        error:
          'Setup endpoint is disabled. Set PLATFORM_ADMIN_SETUP_SECRET in the function secrets and redeploy, then retry.',
      },
      503,
    )
  }

  const provided = (req.headers.get('x-setup-secret') || '').trim()
  if (!provided) return json({ error: 'Missing x-setup-secret header.' }, 401)
  if (!secretsMatch(provided, setupSecret)) return json({ error: 'Invalid setup secret.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = resolveServiceKey()
  if (!supabaseUrl || !serviceKey) {
    return json(
      { error: 'Server is not configured: SUPABASE_URL or the service-role key is missing.' },
      500,
    )
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let payload: Record<string, unknown> = {}
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400)
  }

  const username = normalizeUsername(payload.username)
  const password = String(payload.password || '')
  const notes = String(payload.notes || 'Founder').slice(0, 200)
  // Bootstrap always requires the founder to rotate the temporary password on
  // first login. Callers cannot silently skip the gate.
  const mustChangePassword = payload.must_change_password === false ? false : true

  if (!USERNAME_RE.test(username)) {
    return json({ error: 'Username must be 3-24 letters, numbers or underscores.' }, 400)
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400)
  }

  const email = platformAuthEmail(username)

  const { data: existing, error: lookupError } = await admin
    .from('platform_admins')
    .select('user_id, username')
    .ilike('username', escapeLike(username))
    .maybeSingle()

  if (lookupError) return json({ error: 'Could not read the platform admin allowlist.' }, 502)

  // --- Existing allowlist row: rotate the password / re-confirm the account ---
  if (existing?.user_id) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.user_id, {
      password,
      email,
      email_confirm: true,
      user_metadata: { role: 'platform_admin', username },
    })

    if (updateError && looksLikeMissingUser(updateError.message)) {
      // Allowlist row is stale (auth user deleted). Recreate the auth user and
      // re-link the same allowlist row instead of duplicating it.
      const { data: recreated, error: recreateError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'platform_admin', username },
      })
      if (recreateError || !recreated.user) {
        return json({ error: 'Could not recreate the founder auth account.' }, 502)
      }
      const { error: relinkError } = await admin
        .from('platform_admins')
        .update({ user_id: recreated.user.id, email, notes, must_change_password: true })
        .eq('user_id', existing.user_id)
      if (relinkError) {
        await admin.auth.admin.deleteUser(recreated.user.id)
        return json({ error: 'Could not re-link the platform admin record.' }, 502)
      }
      return json({
        ok: true,
        created: true,
        updated: false,
        must_change_password: true,
        user_id: recreated.user.id,
      })
    }

    if (updateError) {
      return json({ error: updateError.message || 'Could not update the founder password.' }, 502)
    }

    const { error: touchError } = await admin
      .from('platform_admins')
      .update({ email, notes, must_change_password: true })
      .eq('user_id', existing.user_id)
    if (touchError) return json({ error: 'Could not update the platform admin record.' }, 502)

    return json({
      ok: true,
      created: false,
      updated: true,
      must_change_password: true,
      user_id: existing.user_id,
    })
  }

  // --- No allowlist row. Guard against accidental second bootstrap: once any
  //     platform admin exists, a brand-new username must be explicitly allowed. ---
  const { count: adminCount, error: countError } = await admin
    .from('platform_admins')
    .select('user_id', { count: 'exact', head: true })
  if (countError) return json({ error: 'Could not read the platform admin allowlist.' }, 502)
  if ((adminCount || 0) > 0 && payload.allow_new !== true) {
    return json(
      {
        error:
          'A founder account already exists. Re-run with the existing username to rotate its password, ' +
          'or pass "allow_new": true to provision an additional administrator deliberately.',
      },
      409,
    )
  }

  // --- Create the auth user, then link the allowlist row ---
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'platform_admin', username },
  })

  if (createError || !created.user) {
    if (looksLikeDuplicate(createError?.message || '')) {
      return json(
        {
          error:
            'An auth user already exists for this username but is not linked in platform_admins. ' +
            'Link or remove that auth user, then retry. No changes were made.',
        },
        409,
      )
    }
    return json({ error: createError?.message || 'Could not create the founder auth account.' }, 502)
  }

  const { error: allowError } = await admin.from('platform_admins').insert({
    user_id: created.user.id,
    username,
    email,
    notes,
    must_change_password: mustChangePassword,
  })

  if (allowError) {
    // Roll back the auth user so a failed bootstrap leaves no orphan account.
    await admin.auth.admin.deleteUser(created.user.id)
    if (looksLikeDuplicate(allowError.message)) {
      return json({ error: 'This founder username is already in use.' }, 409)
    }
    return json({ error: 'Could not grant platform-admin access.' }, 502)
  }

  return json({
    ok: true,
    created: true,
    updated: false,
    must_change_password: mustChangePassword,
    user_id: created.user.id,
  })
})
