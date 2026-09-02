import { NextResponse } from 'next/server';
import { addDocument, findFolder, removeDocument } from '@/lib/projects';
import { MAX_PAPERWORK_BYTES } from '@/lib/paperwork';
import { currentOrgId } from '@/lib/session';

type Params = { params: Promise<{ id: string; folderId: string }> };

/**
 * Upload one file into a project's paperwork folder. Multipart body with a
 * single `file` field. Type, size and name are validated in lib/paperwork.ts
 * before the bytes reach storage; the row is written only once storage has them.
 */
export async function POST(req: Request, { params }: Params) {
  const { id, folderId } = await params;

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  // Refuse oversize bodies before buffering them when the client declares a length.
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
  const result = await addDocument(orgId, id, folderId, { name: file.name, mime: file.type, bytes });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const { document } = result;
  return NextResponse.json({
    ok: true,
    document: {
      id: document.id,
      name: document.name,
      mime: document.mime,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.uploadedAt,
    },
  });
}

/** Remove a document (row and bytes). `?documentId=` names it. */
export async function DELETE(req: Request, { params }: Params) {
  const { id, folderId } = await params;
  const documentId = new URL(req.url).searchParams.get('documentId');
  if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 });

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await removeDocument(orgId, id, documentId);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    documentCount: findFolder(project, folderId)?.documents.length ?? 0,
  });
}
