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

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');

  // App-scoped idle timeout (30 min). Lives only in the internal app's proxy +
  // its own cookie, so mobile/other apps on the shared project are unaffected.
  if (user && !isApiRoute) {
    const IDLE_MS = 24 * 60 * 60 * 1000;
    const last = request.cookies.get('internal_last_active')?.value;
    const now = Date.now();
    if (last && now - Number(last) > IDLE_MS) {
      await supabase.auth.signOut({ scope: 'local' });
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = 'error=timeout';
      const res = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) =>
        res.cookies.set(c.name, c.value, { ...c, path: '/' })
      );
      res.cookies.set('internal_last_active', '', { path: '/', maxAge: 0 });
      return res;
    }
    supabaseResponse.cookies.set('internal_last_active', String(now), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }

  // Not logged in → bounce to /login (except the login page and api routes).
  if (!user && !isAuthRoute && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, { ...cookie, path: '/' });
    });
    return redirectResponse;
  }

  // Logged in → keep them off the login page.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Logged in → root redirects to dashboard.
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
