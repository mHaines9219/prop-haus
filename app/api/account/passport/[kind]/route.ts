import { NextResponse } from 'next/server';
import { MAX_PAPERWORK_BYTES } from '@/lib/paperwork';
import { isPassportKind, normalizeDocumentPatch } from '@/lib/passport';
import {
  passportDownloadUrl,
  patchPassportDocument,
  removePassportDocument,
  storePassportDocument,
} from '@/lib/passport-store';
import { currentSession } from '@/lib/session';

type Ctx = { params: Promise<{ kind: string }> };

/** Upload into a slot. Multipart body with a single `file` field. Replacing overwrites the pointer. */
export async function POST(req: Request, ctx: Ctx) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { kind } = await ctx.params;
  if (!isPassportKind(kind)) return NextResponse.json({ error: 'unknown document' }, { status: 404 });

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
  const result = await storePassportDocument(
    session.orgId,
    kind,
    { name: file.name, mime: file.type, bytes },
    session.userId,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, document: result.document });
}

/** Download via a short-lived signed URL; the bucket is private. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { kind } = await ctx.params;
  if (!isPassportKind(kind)) return NextResponse.json({ error: 'unknown document' }, { status: 404 });

  const signed = await passportDownloadUrl(session.orgId, kind);
  if (!signed) return NextResponse.json({ error: 'nothing on file' }, { status: 404 });

  return NextResponse.redirect(signed.url, {
    status: 302,
    headers: { 'cache-control': 'private, no-store' },
  });
}

/** Edit expiry and reference on a slot that already has a document. */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { kind } = await ctx.params;
  if (!isPassportKind(kind)) return NextResponse.json({ error: 'unknown document' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'a patch is required' }, { status: 400 });
  }

  const document = await patchPassportDocument(session.orgId, kind, normalizeDocumentPatch(body));
  if (!document) return NextResponse.json({ error: 'nothing on file' }, { status: 404 });

  return NextResponse.json({ ok: true, document });
}

/** Remove the document from a slot. The object stays in the bucket. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { kind } = await ctx.params;
  if (!isPassportKind(kind)) return NextResponse.json({ error: 'unknown document' }, { status: 404 });

  await removePassportDocument(session.orgId, kind);
  return NextResponse.json({ ok: true });
}
