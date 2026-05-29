import { requireInternalAdmin } from '@/services/auth.service';
import { TopNavbar } from '@/components/organisms/TopNavbar.organism';
import { Sidebar } from '@/components/organisms/Sidebar.organism';

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireInternalAdmin();

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <TopNavbar email={user.email} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-h-[calc(100vh-4rem)] bg-bg-primary p-6 ml-64">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
