'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { inviteInternalAdminAction, setAdminActiveAction } from '@/services/internalAdmins.actions';
import type { StaffAccount } from '@/types/internal.types';

export function AdminsClient({
  admins,
  currentUserId,
}: {
  admins: StaffAccount[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const res = await inviteInternalAdminAction({ email, fullName });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEmail('');
    setFullName('');
    setInfo('Undangan terkirim.');
    router.refresh();
  }

  function toggle(a: StaffAccount) {
    startTransition(async () => {
      const res = await setAdminActiveAction({ userId: a.user_id, active: !a.is_active });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Admin Internal</h1>
        <p className="mt-1 text-sm text-text-secondary">Staf dengan akses penuh ke seluruh gereja.</p>
      </div>

      <form
        onSubmit={invite}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border-color bg-bg-secondary p-4"
      >
        <label className="text-sm text-text-secondary">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@terhubung.app"
            className="mt-1 block w-64 rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand"
          />
        </label>
        <label className="text-sm text-text-secondary">
          Nama (opsional)
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block w-48 rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? 'Mengundang…' : 'Undang'}
        </button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}
      {info && <p className="text-sm text-brand">{info}</p>}

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">No.</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Dibuat</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {admins.map((a, i) => (
              <tr key={a.user_id} className="border-t border-border-color">
                <td className="px-4 py-3 text-text-secondary">{i + 1}</td>
                <td className="px-4 py-3 text-text-primary">
                  {a.email}
                  {a.user_id === currentUserId && (
                    <span className="ml-2 text-xs text-text-secondary">(Anda)</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={a.is_active ? 'success' : 'secondary'}>
                    {a.is_active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {new Date(a.created_at).toLocaleDateString('id-ID')}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggle(a)}
                    disabled={pending || (a.user_id === currentUserId && a.is_active)}
                    className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
                  >
                    {a.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
