'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import type { ActionResult } from '@/types/internal.types';

// "Perbarui" button — drop the 5-minute analytics cache and re-render.
// Next 16: updateTag (not revalidateTag) is the immediate, read-your-own-writes
// purge inside a server action.
export async function refreshAnalyticsAction(): Promise<ActionResult> {
  await requireInternalAdmin();
  updateTag('platform-analytics');
  revalidatePath('/dashboard');
  return { ok: true };
}
