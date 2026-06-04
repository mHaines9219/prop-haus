import type { Attachment } from './types';

const MAX_FILES = 6;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const ALLOWED_PDF = new Set(['application/pdf']);

export async function parseAttachments(form: FormData): Promise<{ attachments: Attachment[]; error?: string }> {
  const raw = form.getAll('files');
  const files = raw.filter((v): v is File => v instanceof File);
  if (files.length > MAX_FILES) {
    return { attachments: [], error: `Too many files (max ${MAX_FILES})` };
  }
  const out: Attachment[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return { attachments: [], error: `${file.name} is too large (>${MAX_BYTES / 1024 / 1024}MB)` };
    }
    const mime = file.type || guessMime(file.name);
    let kind: 'image' | 'pdf';
    if (ALLOWED_IMAGE.has(mime)) kind = 'image';
    else if (ALLOWED_PDF.has(mime)) kind = 'pdf';
    else return { attachments: [], error: `Unsupported file type for ${file.name}: ${mime}` };

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString('base64');
    out.push({ kind, mime, filename: file.name, dataUrl: `data:${mime};base64,${base64}` });
  }
  return { attachments: out };
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
