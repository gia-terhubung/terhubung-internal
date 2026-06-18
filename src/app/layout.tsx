import type { Metadata } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' });

export const metadata: Metadata = {
  title: 'Terhubung Internal',
  description: 'Internal CMS',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${figtree.variable} ${bricolage.variable} font-sans bg-white dark:bg-bg-primary transition-colors duration-300 relative`}>
        {/* Desktop-only: this dashboard is dense, steer mobile users away. */}
        <div className="fixed inset-0 z-9999 flex md:hidden flex-col items-center justify-center bg-bg-primary px-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-3">Gunakan Perangkat Desktop</h1>
          <p className="text-text-secondary text-sm leading-relaxed max-w-xs">
            Terhubung Internal dirancang untuk layar besar. Buka melalui browser Desktop atau Laptop.
          </p>
        </div>

        <div className="hidden md:block min-h-screen">
          <ThemeProvider>
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
