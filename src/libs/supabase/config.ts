export const cookieOptions = {
  name: 'sb-terhubung-internal',
  // Highest-privilege app: pin SameSite + Secure explicitly (don't rely on
  // @supabase/ssr defaults). Lax blocks the cross-site POST-logout CSRF vector;
  // Secure keeps the session cookie off any non-HTTPS hop in production.
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};
