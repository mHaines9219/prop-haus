import { NextResponse } from 'next/server';
import { currentOrgId } from '@/lib/session';
import { documentDownloadUrl } from '@/lib/forms/documents';

type Params = { params: Promise<{ id: string }> };

/**
 * Download a filled form (the signed copy when there is one). The bucket is
 * private, so this mints a 60s signed URL after the org check and redirects.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const signed = await documentDownloadUrl(id, orgId);
  if (!signed) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.redirect(signed.url, {
    status: 302,
    headers: { 'cache-control': 'private, no-store' },
  });
}
