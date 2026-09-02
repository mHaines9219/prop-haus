import { NextResponse } from 'next/server';
import { documentDownloadUrl } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

type Params = { params: Promise<{ id: string; documentId: string }> };

/**
 * Download a paperwork document. The bucket is private, so this mints a
 * short-lived signed URL (after the org check) and redirects to it. Links on
 * the paperwork page point here, never at storage directly.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id, documentId } = await params;

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const signed = await documentDownloadUrl(orgId, id, documentId);
  if (!signed) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.redirect(signed.url, {
    status: 302,
    headers: { 'cache-control': 'private, no-store' },
  });
}
