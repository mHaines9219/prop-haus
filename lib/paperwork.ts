/**
 * Paperwork uploads: what a production's paperwork folder will accept, and the
 * pure validation the upload route runs before any byte touches storage.
 *
 * Storage itself is Supabase Storage (private 'paperwork' bucket, created by
 * 20260902120000_project_folders.sql). The bucket name is overridable via
 * PAPERWORK_BUCKET for environments that name buckets differently.
 */

/** Hard cap per file. Vercel serverless bodies cap at ~4.5 MB; self-hosted runs get the full allowance. */
export const MAX_PAPERWORK_BYTES = 20 * 1024 * 1024;

/**
 * mime → canonical extension. Anything not listed is refused. The list covers
 * what actually circulates on a production: PDFs (COIs, W9s, deal memos),
 * office documents (budgets, call sheets), and photos of signed paper.
 */
const ALLOWED: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

/** Browsers sometimes send an empty or generic type; fall back to the extension. */
const BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED).map(([mime, ext]) => [ext, mime]),
);
BY_EXTENSION.jpeg = 'image/jpeg';

export type PaperworkCheck =
  | { ok: true; mime: string; ext: string; name: string }
  | { ok: false; reason: string };

/**
 * Decide whether a file may be stored. Returns the mime we will record (the
 * declared one, or the one inferred from the extension when the browser sent
 * nothing useful) and a safe display name.
 */
export function checkPaperworkFile(input: {
  name: string;
  mime: string;
  size: number;
}): PaperworkCheck {
  const name = cleanFileName(input.name);
  if (!name) return { ok: false, reason: 'The file needs a name.' };

  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, reason: `${name} is empty.` };
  }
  if (input.size > MAX_PAPERWORK_BYTES) {
    return {
      ok: false,
      reason: `${name} is too large (max ${Math.round(MAX_PAPERWORK_BYTES / 1024 / 1024)} MB).`,
    };
  }

  const declared = (input.mime || '').split(';')[0].trim().toLowerCase();
  let mime = declared in ALLOWED ? declared : '';
  if (!mime) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const inferred = BY_EXTENSION[ext];
    if (inferred && (!declared || declared === 'application/octet-stream')) mime = inferred;
  }
  if (!mime) {
    return {
      ok: false,
      reason: `${name} isn’t a supported type. Upload a PDF, image, or Office document.`,
    };
  }

  return { ok: true, mime, ext: ALLOWED[mime], name };
}

/**
 * A display name safe to render and to echo in a Content-Disposition header:
 * no path separators, no control characters, bounded length. The stored object
 * key never uses this — it uses the row id — so this is purely for humans.
 */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const stripped = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return stripped.slice(0, 200);
}

/** Human-readable size for the paperwork list. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Short type label for a document row ("PDF", "DOCX", "JPG"). */
export function documentTypeLabel(mime: string): string {
  const ext = ALLOWED[mime];
  return ext ? ext.toUpperCase() : 'FILE';
}

/** Private bucket holding paperwork bytes. */
export function paperworkBucket(): string {
  return process.env.PAPERWORK_BUCKET || 'paperwork';
}

/** How long a paperwork download link stays valid. */
export const PAPERWORK_SIGNED_URL_SECONDS = 60;
