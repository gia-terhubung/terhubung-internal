import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieOptions } from './libs/supabase/config';

// Next.js 16: "Proxy" is the renamed Middleware. Same functionality.
// This refreshes the Supabase session cookie and does optimistic redirects.
// It is NOT an authorization boundary — the internal-admin allowlist check
// lives in requireInternalAdmin() (src/services/auth.service.ts).
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
      cookieOptions,
    }
  );

  // getClaims verifies the JWT locally (no network round-trip) once asymmetric
  // JWT signing keys are enabled, and still refreshes an expired access token
  // via the refresh token.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');

  // App-scoped absolute session cap (1h). Lives only in the internal app's
  // proxy + its own cookie, so mobile/other apps on the shared project are
  // unaffected. Anchored to claims.session_id, which survives refresh-token
  // rotation and only changes on a new login.
  if (claims) {
    const MAX_SESSION_MS = 60 * 60 * 1000;
    const anchor = request.cookies.get('internal_session_start')?.value;
    const [anchorSid, anchorStart] = anchor?.split(':') ?? [];
    const now = Date.now();
    if (anchorSid === claims.session_id && anchorStart && now - Number(anchorStart) > MAX_SESSION_MS) {
      await supabase.auth.signOut({ scope: 'local' });
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = 'error=expired';
      const res = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) =>
        res.cookies.set(c.name, c.value, { ...c, path: '/' })
      );
      res.cookies.set('internal_session_start', '', { path: '/', maxAge: 0 });
      return res;
    }
    if (anchorSid !== claims.session_id || !anchorStart) {
      supabaseResponse.cookies.set('internal_session_start', `${claims.session_id}:${now}`, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }
    // Retire the old idle-timeout cookie.
    if (request.cookies.get('internal_last_active')) {
      supabaseResponse.cookies.set('internal_last_active', '', { path: '/', maxAge: 0 });
    }
  }

  // Not logged in → bounce to /login (except the login page).
  if (!claims && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, { ...cookie, path: '/' });
    });
    return redirectResponse;
  }

  // Logged in → keep them off the login page.
  if (claims && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Logged in → root redirects to dashboard.
  if (claims && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    {
      /*
       * Match all request paths except for:
       * - api (route handlers self-authenticate / use their own client)
       * - _next/static (static files)
       * - _next/image (image optimization files)
       * - favicon.ico (favicon file)
       * - images, svgs, etc.
       */
      source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
      /*
       * Skip Link prefetch requests — the proxy re-runs on the real navigation.
       */
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
