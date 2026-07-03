'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface TabNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

// Horizontal tab bar for route hubs (/billing, /moderation).
export function TabNav({ items }: { items: TabNavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1 border-b border-border-color">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? 'border-brand font-medium text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
