import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/libs/supabase/server';
import { createAdminClient } from '@/libs/supabase/admin';
import type { InternalSessionUser } from '@/types/internal.types';

export const ALLOWED_DOMAIN = '@terhubung.app';

/** Valid Supabase session, or redirect to /login. */
export const requireSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');
  return { supabase, user };
});

/**
 * Deny-by-default authorization. A valid session is NOT enough — the user must
 * be an active internal admin (checked via the service-role RPC, since the
 * allowlist lives in the unexposed `internal` schema). Enforce this in every
 * protected page and every server action.
 */
export const requireInternalAdmin = cache(async (): Promise<{ user: InternalSessionUser }> => {
  const { user } = await requireSession();

  const email = user.email?.toLowerCase() ?? '';
  // Route denials through /api/auth/deny, which signs the session out first.
  // Redirecting straight to /login would loop (proxy bounces logged-in users
  // off /login back to /dashboard).
  if (!email.endsWith(ALLOWED_DOMAIN)) redirect('/api/auth/deny?reason=domain');

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('internal_is_admin', { p_uid: user.id });
  if (error || data !== true) redirect('/api/auth/deny?reason=not_allowed');

  return { user: { id: user.id, email } };
});
