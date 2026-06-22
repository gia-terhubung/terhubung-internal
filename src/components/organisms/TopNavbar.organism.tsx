'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../atoms/ThemeToggle.atom';
import { Avatar } from '../atoms/Avatar.atom';
import { Badge } from '../atoms/Badge.atom';

export function TopNavbar({ email }: { email: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="h-16 border-b border-border-color/70 bg-bg-primary/70 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded">
          <Image src="/images/icon.png" alt="Terhubung" fill className="object-cover" sizes="32px" />
        </div>
        <span className="text-text-primary font-bold text-lg tracking-tight">
          Terhubung <span className="text-brand font-normal">Internal</span>
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-text-primary text-sm font-semibold max-w-50 truncate" title={email}>
              {email}
            </span>
            <div className="mt-0.5">
              <Badge variant="secondary">Superadmin</Badge>
            </div>
          </div>
          <Avatar initials={email} />
        </div>
        <div className="h-6 w-px bg-border-strong" />
        <ThemeToggle />
        <div className="h-6 w-px bg-border-strong" />
        <button
          onClick={handleLogout}
          className="text-text-secondary hover:text-danger transition-colors text-sm font-medium"
        >
          Keluar
        </button>
      </div>
    </header>
  );
}
