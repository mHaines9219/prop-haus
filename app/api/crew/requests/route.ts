import { NextResponse } from 'next/server';
import { currentOrgId, currentSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/analytics';

type RequestBody = {
  contractor_id: string;
  requested_dates?: string[];
  location?: string;
  notes?: string;
};

/** List the org's crew requests (with contractor name). Auth required. */
export async function GET() {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('crew_requests')
    .select(
      'id, contractor_id, requested_dates, location, notes, status, created_at, updated_at, contractors(name, photo)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[crew/requests] list error', error);
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

/** Create a crew request. Auth required; org comes from session, not body. */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const orgId = session.orgId;

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

  await recordEvents({
    orgId,
    userId: session.userId,
    type: 'crew_requested',
    payload: { crewRequestId: data.id, contractorId: contractor_id },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
