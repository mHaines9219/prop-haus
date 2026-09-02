import { NextResponse } from 'next/server';
import { MAX_PAPERWORK_BYTES } from '@/lib/paperwork';
import { coiDownloadUrl, storeCoiDocument } from '@/lib/order-profile-store';
import { currentOrgId } from '@/lib/session';

/**
 * Upload the production's own COI — the certificate their broker issued.
 * Multipart body with a single `file` field (PDF or image). Replacing one
 * overwrites the profile's pointer; the previous object is left in the bucket.
 */
export async function POST(req: Request) {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PAPERWORK_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'file is too large' }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'a file is required' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await storeCoiDocument(orgId, { name: file.name, mime: file.type, bytes });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, document: result.document });
}

/** Download the COI on file via a short-lived signed URL; the bucket is private. */
export async function GET() {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const signed = await coiDownloadUrl(orgId);
  if (!signed) return NextResponse.json({ error: 'no certificate on file' }, { status: 404 });

  return NextResponse.redirect(signed.url, {
    status: 302,
    headers: { 'cache-control': 'private, no-store' },
  });
}
