import { redirect } from 'next/navigation';

// '/' is unreachable in practice (proxy redirects by auth state); send to dashboard.
export default function Home() {
  redirect('/dashboard');
}
