// Seed the first internal superadmin (bootstrap).
//
// Creates an EMAIL-ONLY auth user (no phone -> cannot use the mobile app) and
// adds it to the internal allowlist via the locked-down service-role RPC.
//
// Prereq: the migration (20260529120000_internal_admin.sql) is already applied
// remotely, so public.internal_add_admin() exists.
//
// Run (Node 20.6+):
//   node --env-file=.env.local scripts/seed-internal-superadmin.mjs [email]
// Defaults to gia@terhubung.app. Idempotent — safe to re-run.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.argv[2] ?? 'gia@terhubung.app').trim().toLowerCase();

if (!url || !key) {
  console.error('Missing env. Run: node --env-file=.env.local scripts/seed-internal-superadmin.mjs');
  process.exit(1);
}
if (!EMAIL.endsWith('@terhubung.app')) {
  console.error(`Email must end with @terhubung.app (got ${EMAIL}).`);
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. Create the auth user (email-only, pre-confirmed, NO phone).
let userId;
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  email_confirm: true,
  user_metadata: { full_name: EMAIL.split('@')[0] },
});

if (created?.user) {
  userId = created.user.id;
  console.log('Created auth user:', userId);
} else if (createErr && /already|registered|exists/i.test(createErr.message)) {
  // Already exists — find the id.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) { console.error('listUsers failed:', listErr.message); process.exit(1); }
  userId = list.users.find((u) => u.email?.toLowerCase() === EMAIL)?.id;
  console.log('Auth user already existed:', userId);
} else {
  console.error('createUser failed:', createErr?.message);
  process.exit(1);
}

if (!userId) {
  console.error('Could not resolve user id for', EMAIL);
  process.exit(1);
}

// 2. Add to the internal allowlist (RPC; idempotent on unique violation).
const { error: rpcErr } = await admin.rpc('internal_add_admin', {
  p_user_id: userId,
  p_email: EMAIL,
  p_invited_by: null,
});
if (rpcErr && !/duplicate|already exists|unique/i.test(rpcErr.message)) {
  console.error('internal_add_admin failed:', rpcErr.message);
  process.exit(1);
}

console.log('✓ Internal superadmin ready:', EMAIL);
