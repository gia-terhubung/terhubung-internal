'use client';

import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';

const ThemeToggleButton = () => {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-bg-secondary text-gray-600 dark:text-text-secondary hover:bg-gray-200 dark:hover:bg-bg-hover transition-colors"
      aria-label={theme === 'dark' ? 'Ubah ke mode terang' : 'Ubah ke mode gelap'}
      title={theme === 'dark' ? 'Ubah ke mode terang' : 'Ubah ke mode gelap'}
    >
      {theme === 'dark' ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
};

export const ThemeToggle = dynamic(() => Promise.resolve(ThemeToggleButton), {
  ssr: false,
  loading: () => <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-bg-secondary animate-pulse" />,
});
