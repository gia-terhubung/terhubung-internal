import { createClient } from '@/libs/supabase/server';
import { NextResponse } from 'next/server';

// An authenticated user who is NOT an active internal admin is sent here.
// We sign them out (clears the session cookie) and forward to /login with a
// reason. Signing out is what prevents a redirect loop with the proxy, which
// otherwise bounces any logged-in user away from /login back to /dashboard.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });

  const { origin, searchParams } = new URL(request.url);
  const reason = searchParams.get('reason') ?? 'not_allowed';
  return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
}
