import { requireInternalAdmin } from '@/services/auth.service';
import { listInternalAdmins } from '@/services/internalAdmins.service';
import { AdminsClient } from './client';

export default async function AdminsPage() {
  const { user } = await requireInternalAdmin();
  const admins = await listInternalAdmins();
  return <AdminsClient admins={admins} currentUserId={user.id} />;
}
