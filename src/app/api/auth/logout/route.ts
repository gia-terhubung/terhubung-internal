import { createClient } from '@/libs/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  return NextResponse.json({ ok: true });
}
