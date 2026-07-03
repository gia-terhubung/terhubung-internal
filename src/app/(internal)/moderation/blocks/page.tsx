import { listUserBlocks } from '@/services/moderation.service';

// Read-only: blocks are managed by users from the mobile app.
export default async function ModerationBlocksPage() {
  const { total, rows } = await listUserBlocks();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {new Intl.NumberFormat('id-ID').format(total)} blokir aktif
        </p>
        <span className="text-xs text-text-secondary">
          Dikelola pengguna dari aplikasi — baca saja
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Pemblokir</th>
              <th className="px-4 py-3 font-medium">Diblokir</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-text-secondary">
                  Belum ada blokir.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border-color">
                  <td className="px-4 py-3 text-text-primary">{r.blocker_name}</td>
                  <td className="px-4 py-3 text-text-primary">{r.blocked_name}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(r.created_at).toLocaleDateString('id-ID')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > rows.length && (
        <p className="text-xs text-text-secondary">Menampilkan 50 terbaru dari {total}.</p>
      )}
    </div>
  );
}
