import { NextResponse } from 'next/server';
import { currentOrgId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

type RequestBody = {
  contractor_id: string;
  requested_dates?: string[];
  location?: string;
  notes?: string;
};

/** Create a crew request. Auth required; org comes from session, not body. */
export async function POST(req: Request) {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { contractor_id, requested_dates, location, notes } = body;
  if (!contractor_id?.trim()) {
    return NextResponse.json({ error: 'contractor_id is required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('crew_requests')
    .insert({
      org_id: orgId,
      contractor_id,
      requested_dates: requested_dates ?? [],
      location: location?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[crew/requests] insert error', error);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
