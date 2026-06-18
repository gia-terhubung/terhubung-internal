'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/libs/supabase/client';

const ALLOWED_DOMAIN = '@terhubung.app';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const urlError = params.get('error');
  const urlNotice =
    urlError === 'not_allowed'
      ? 'Akun ini tidak memiliki akses internal.'
      : urlError === 'domain'
      ? `Hanya email ${ALLOWED_DOMAIN} yang diizinkan.`
      : urlError === 'timeout'
      ? 'Sesi berakhir karena tidak aktif. Silakan masuk lagi.'
      : null;

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith(ALLOWED_DOMAIN)) {
      setError(`Gunakan email ${ALLOWED_DOMAIN}`);
      return;
    }
    setLoading(true);
    // shouldCreateUser:false => a random email can never self-provision.
    await supabase.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: false } });
    setLoading(false);
    setInfo('Jika email terdaftar, kode telah dikirim ke email Anda.');
    setStep('code');
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    setLoading(false);
    if (error) {
      setError('Kode salah atau kedaluwarsa.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand';
  const btnCls =
    'w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-content transition-colors hover:bg-brand-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-tertiary';

  return (
    <div className="w-full max-w-md rounded-2xl border border-border-color bg-bg-tertiary p-8 shadow-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="relative mb-4 h-16 w-16 overflow-hidden rounded-xl">
          <Image src="/images/icon.png" alt="Terhubung" fill className="object-cover" sizes="64px" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">Masuk ke Terhubung Internal</h1>
      </div>

      {urlNotice && (
        <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{urlNotice}</p>
      )}

      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-4">
          <label className="block text-sm text-text-secondary">
            Email
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`nama${ALLOWED_DOMAIN}`}
              className={inputCls}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'Mengirim…' : 'Kirim kode'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          {info && <p className="text-sm text-text-secondary">{info}</p>}
          <label className="block text-sm text-text-secondary">
            Kode masuk
            <input
              inputMode="numeric"
              autoFocus
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Masukkan kode"
              className={`${inputCls} tracking-widest`}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'Memverifikasi…' : 'Masuk'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setError(null);
              setInfo(null);
            }}
            className="w-full text-sm text-text-secondary hover:text-text-primary"
          >
            Ganti email
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-bg-primary text-text-primary">

      {/* LEFT — brand panel (lg+ only, wordmark-only) */}
      <aside className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden bg-[linear-gradient(150deg,#43c6b6_0%,#2e9488_100%)] text-white">
        {/* faint static dot-grid echoing brand texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle,#ffffff_1.5px,transparent_1.5px)] bg-[length:22px_22px]"
        />

        <div className="relative h-10 w-10 overflow-hidden rounded-lg">
          <Image src="/images/icon.png" alt="Terhubung" fill className="object-cover" sizes="40px" />
        </div>

        <div className="relative">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Internal</span>
          <h2 className="font-display text-5xl xl:text-6xl font-bold tracking-tight">Terhubung</h2>
        </div>

        <span className="relative text-sm text-white/60">terhubung.app</span>
      </aside>

      {/* RIGHT — OTP card */}
      <main className="flex flex-1 items-center justify-center p-8">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
