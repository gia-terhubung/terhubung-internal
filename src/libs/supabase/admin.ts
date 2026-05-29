import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS — server-side ONLY.
 *
 * The `server-only` import makes the build fail if this module is ever
 * imported from a Client Component, guaranteeing the service-role key
 * never ships to the browser.
 *
 * SECURITY: every caller MUST verify `requireInternalAdmin()` BEFORE using
 * this client. See src/services/auth.service.ts.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
