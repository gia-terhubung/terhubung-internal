import { notFound } from 'next/navigation';
import { getChurch, getChurchAdmins, getChurchContact } from '@/services/church.service';
import { getChurchBillingHistory, getChurchSubscription } from '@/services/billing.service';
import { ChurchDetailClient } from './client';

export default async function ChurchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const church = await getChurch(id);
  if (!church) notFound();

  const [admins, subscription, billing, contact] = await Promise.all([
    getChurchAdmins(id),
    getChurchSubscription(id),
    getChurchBillingHistory(id),
    getChurchContact(id),
  ]);

  return (
    <ChurchDetailClient
      church={church}
      admins={admins}
      subscription={subscription}
      billing={billing}
      contact={contact}
    />
  );
}
