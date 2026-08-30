import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Public list of active contractors. No auth required — browse is public. */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contractors')
    .select('id, name, photo, skills, city, rate_low, rate_high, bio, category')
    .eq('active', true)
    .order('name');

  if (error) {
    console.error('[crew] list error', error);
    return NextResponse.json({ error: 'Failed to load contractors' }, { status: 500 });
  }

  return NextResponse.json({ contractors: data ?? [] });
}
