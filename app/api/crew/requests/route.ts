import { NextResponse } from 'next/server';
import { currentOrgId, currentSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/analytics';
import { getProject } from '@/lib/projects';

type RequestBody = {
  contractor_id?: unknown;
  requested_dates?: unknown;
  location?: unknown;
  notes?: unknown;
  /** The project the crew is for (its Crew section lists the request). Optional. */
  project_id?: unknown;
};

const MAX_DATES = 60;
const DATE_MAX = 32;
const LOCATION_MAX = 500;
const NOTES_MAX = 4000;
const LIST_LIMIT = 200;

/** Optional free text: trimmed, null when blank, `false` when not text or too long. */
function optionalText(v: unknown, max: number): string | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > max) return false;
  return v.trim() || null;
}

/** List the org's crew requests (with contractor name). Auth required. */
export async function GET() {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('crew_requests')
    .select(
      'id, project_id, contractor_id, requested_dates, location, notes, status, created_at, updated_at, contractors(name, photo)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);

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

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const { project_id } = body;
  const contractor_id = typeof body.contractor_id === 'string' ? body.contractor_id.trim() : '';
  if (!contractor_id || contractor_id.length > 128) {
    return NextResponse.json({ error: 'contractor_id is required' }, { status: 400 });
  }
  const requested_dates = body.requested_dates ?? [];
  if (
    !Array.isArray(requested_dates) ||
    requested_dates.length > MAX_DATES ||
    !requested_dates.every((d) => typeof d === 'string' && d.length > 0 && d.length <= DATE_MAX)
  ) {
    return NextResponse.json({ error: 'requested_dates must be a list of dates' }, { status: 400 });
  }
  const location = optionalText(body.location, LOCATION_MAX);
  const notes = optionalText(body.notes, NOTES_MAX);
  if (location === false) return NextResponse.json({ error: 'location must be short text' }, { status: 400 });
  if (notes === false) return NextResponse.json({ error: 'notes must be text' }, { status: 400 });

  // Only the session org's own project may be attached; a foreign or unknown
  // id is refused so a request never lands on someone else's project page.
  let projectId: string | null = null;
  if (project_id !== undefined && project_id !== null && project_id !== '') {
    if (typeof project_id !== 'string') {
      return NextResponse.json({ error: 'project_id must be a string' }, { status: 400 });
    }
    const project = await getProject(orgId, project_id);
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
    projectId = project.id;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('crew_requests')
    .insert({
      org_id: orgId,
      project_id: projectId,
      contractor_id,
      requested_dates,
      location,
      notes,
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
    payload: { crewRequestId: data.id, contractorId: contractor_id, projectId },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
