'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (p: string) => boolean;
}

const ICON = {
  dashboard: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  ),
  church: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-4a3 3 0 016 0v4M12 3v3m-1.5 1.5h3" />
  ),
  billing: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  ),
  shield: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  ),
  clock: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
};

const MAIN: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: ICON.dashboard, match: (p) => p === '/dashboard' },
];
const DATA: NavItem[] = [
  { href: '/churches', label: 'Gereja', icon: ICON.church, match: (p) => p.startsWith('/churches') },
  { href: '/billing', label: 'Billing', icon: ICON.billing, match: (p) => p.startsWith('/billing') },
  { href: '/history', label: 'Riwayat Gereja', icon: ICON.clock, match: (p) => p.startsWith('/history') },
];
const ACCESS: NavItem[] = [
  { href: '/admins', label: 'Admin Internal', icon: ICON.shield, match: (p) => p.startsWith('/admins') },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const shouldCollapse = localStorage.getItem('terhubung_sidebar_collapsed') === 'true';
    if (shouldCollapse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCollapsed(true);
      document.body.classList.add('sidebar-collapsed');
    }
    setIsMounted(true);
  }, []);

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('terhubung_sidebar_collapsed', String(next));
    document.body.classList.toggle('sidebar-collapsed', next);
  };

  const widthClass = !isMounted ? 'w-64' : isCollapsed ? 'w-20' : 'w-64';

  const renderLink = (item: NavItem) => {
    const active = item.match(pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
          active
            ? 'bg-bg-hover text-brand font-medium border border-border-strong'
            : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
        } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        <svg className="w-5 h-5 min-w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {item.icon}
        </svg>
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  const renderSection = (title: string, items: NavItem[]) => (
    <div>
      {!isCollapsed ? (
        <h3 className="px-3 mb-2 text-xs font-bold text-text-secondary uppercase tracking-wider">{title}</h3>
      ) : (
        <div className="h-px bg-border-color my-4 w-8 mx-auto" />
      )}
      <div className="space-y-1">{items.map(renderLink)}</div>
    </div>
  );

  return (
    <aside
      className={`fixed left-3 top-[4.75rem] bottom-3 rounded-2xl border border-border-color bg-bg-secondary shadow-lg flex flex-col z-10 transition-all duration-300 ${widthClass}`}
    >
      <button
        onClick={toggleSidebar}
        title={isCollapsed ? 'Perbesar Sidebar' : 'Perkecil Sidebar'}
        aria-label={isCollapsed ? 'Perbesar Sidebar' : 'Perkecil Sidebar'}
        className="absolute top-6 right-0 translate-x-1/2 z-20 w-7 h-7 rounded-full bg-bg-secondary border border-border-color text-text-secondary shadow-md flex items-center justify-center hover:bg-bg-tertiary hover:text-brand hover:scale-110 active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <nav className="p-4 space-y-6 overflow-y-auto flex-1 pb-24 text-sm">
        <div className="space-y-1">{MAIN.map(renderLink)}</div>
        {renderSection('Data', DATA)}
        {renderSection('Akses', ACCESS)}
      </nav>
    </aside>
  );
}
