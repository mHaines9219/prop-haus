/**
 * GET /api/coi/certificates — list the org's issued/pending certificates.
 *
 * Optional query params:
 *   ?orderId=<uuid>  — filter by order
 *   ?status=issued|pending|failed|expired
 *
 * Auth required.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { currentOrgId } from '@/lib/session';

export async function GET(req: Request) {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const url = new URL(req.url);
  const orderId = url.searchParams.get('orderId');
  const status = url.searchParams.get('status');

  const supabase = await createClient();

  let query = supabase
    .from('certificates')
    .select('id, vendor_id, vendor_name, external_id, status, coverage_snapshot, document_url, effective_date, expiry_date, error_message, created_at, order_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (orderId) query = query.eq('order_id', orderId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    console.error('[coi/certificates] query error', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  return NextResponse.json({ certificates: data ?? [] });
}
