import Link from 'next/link';
import { requireInternalAdmin } from '@/services/auth.service';

const CARDS = [
  { href: '/churches', title: 'Gereja', desc: 'Buat gereja & tetapkan admin gereja.' },
  { href: '/billing', title: 'Billing', desc: 'Status langganan semua gereja.' },
  { href: '/admins', title: 'Admin Internal', desc: 'Undang & kelola staf internal.' },
];

export default async function DashboardPage() {
  const { user } = await requireInternalAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">Masuk sebagai {user.email}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-border-color bg-bg-secondary p-5 transition-colors hover:border-brand"
          >
            <div className="font-semibold text-text-primary">{c.title}</div>
            <div className="mt-1 text-sm text-text-secondary">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
