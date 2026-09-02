import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { CREW_CATEGORY, getCrewRole, isCrewRoleSlug } from '@/lib/crew';

export const dynamic = 'force-dynamic';

/**
 * Public list of active crew contractors. No auth required — browse is public.
 * Optional `?role=production-assistant|delivery` narrows to contractors whose
 * skills fall under that role (see lib/crew.ts).
 */
export async function GET(req: Request) {
  const role = new URL(req.url).searchParams.get('role');
  if (role !== null && !isCrewRoleSlug(role)) {
    return NextResponse.json({ error: 'unknown role' }, { status: 400 });
  }

  const supabase = await createClient();

  let query = supabase
    .from('contractors')
    .select('id, name, photo, skills, city, rate_low, rate_high, bio, category')
    .eq('active', true)
    .eq('category', CREW_CATEGORY)
    .order('name');

  if (role) query = query.overlaps('skills', getCrewRole(role).skills);

  const { data, error } = await query;

  if (error) {
    console.error('[crew] list error', error);
    return NextResponse.json({ error: 'Failed to load contractors' }, { status: 500 });
  }

  return NextResponse.json({ contractors: data ?? [] });
}
