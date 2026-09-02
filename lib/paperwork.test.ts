import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PAPERWORK_BYTES,
  PAPERWORK_SIGNED_URL_SECONDS,
  checkPaperworkFile,
  cleanFileName,
  documentTypeLabel,
  formatBytes,
  paperworkBucket,
} from './paperwork';

describe('checkPaperworkFile', () => {
  it('accepts a PDF as declared', () => {
    const r = checkPaperworkFile({ name: 'COI - Newel.pdf', mime: 'application/pdf', size: 1024 });
    expect(r).toEqual({ ok: true, mime: 'application/pdf', ext: 'pdf', name: 'COI - Newel.pdf' });
  });

  it('infers the type from the extension when the browser sends nothing useful', () => {
    expect(checkPaperworkFile({ name: 'w9.PDF', mime: '', size: 10 })).toMatchObject({
      ok: true,
      mime: 'application/pdf',
    });
    expect(
      checkPaperworkFile({ name: 'budget.xlsx', mime: 'application/octet-stream', size: 10 }),
    ).toMatchObject({
      ok: true,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
    });
  });

  it('does not let an extension override a declared, unsupported type', () => {
    // A .pdf that the browser says is HTML is not a PDF.
    expect(checkPaperworkFile({ name: 'x.pdf', mime: 'text/html', size: 10 })).toMatchObject({
      ok: false,
    });
  });

  it('refuses executables, archives and unknown types', () => {
    for (const [name, mime] of [
      ['run.exe', 'application/x-msdownload'],
      ['site.html', 'text/html'],
      ['bundle.zip', 'application/zip'],
      ['noext', ''],
    ] as const) {
      expect(checkPaperworkFile({ name, mime, size: 10 })).toMatchObject({ ok: false });
    }
  });

  it('refuses empty and oversize files', () => {
    expect(checkPaperworkFile({ name: 'a.pdf', mime: 'application/pdf', size: 0 })).toMatchObject({
      ok: false,
    });
    expect(
      checkPaperworkFile({ name: 'a.pdf', mime: 'application/pdf', size: MAX_PAPERWORK_BYTES + 1 }),
    ).toMatchObject({ ok: false });
    expect(
      checkPaperworkFile({ name: 'a.pdf', mime: 'application/pdf', size: MAX_PAPERWORK_BYTES }),
    ).toMatchObject({ ok: true });
  });

  it('ignores mime parameters and case', () => {
    expect(
      checkPaperworkFile({ name: 'notes.txt', mime: 'Text/Plain; charset=utf-8', size: 5 }),
    ).toMatchObject({ ok: true, mime: 'text/plain', ext: 'txt' });
  });
});

describe('cleanFileName', () => {
  it('drops path components, control characters and quotes', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('C:\\Users\\me\\deal memo.docx')).toBe('deal memo.docx');
    expect(cleanFileName('call\u0000sheet".pdf')).toBe('callsheet.pdf');
  });

  it('bounds the length', () => {
    expect(cleanFileName('x'.repeat(500))).toHaveLength(200);
  });

  it('returns an empty string for a nameless file', () => {
    expect(cleanFileName('   ')).toBe('');
    expect(cleanFileName('/')).toBe('');
  });
});

describe('labels', () => {
  it('formats sizes for the paperwork list', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(300 * 1024)).toBe('300 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });

  it('labels known types by extension and everything else as FILE', () => {
    expect(documentTypeLabel('application/pdf')).toBe('PDF');
    expect(documentTypeLabel('image/jpeg')).toBe('JPG');
    expect(documentTypeLabel('application/x-unknown')).toBe('FILE');
  });
});

describe('checkPaperworkFile fallbacks', () => {
  it('uses the extension only when the browser sent nothing or octet-stream', () => {
    expect(checkPaperworkFile({ name: 'photo.jpeg', mime: 'application/octet-stream', size: 1 })).toMatchObject({
      ok: true,
      mime: 'image/jpeg',
      ext: 'jpg',
    });
    expect(checkPaperworkFile({ name: 'scan.HEIC', mime: '', size: 1 })).toMatchObject({ ok: true, mime: 'image/heic', ext: 'heic' });
    expect(checkPaperworkFile({ name: 'bundle.zip', mime: 'application/octet-stream', size: 1 })).toMatchObject({ ok: false });
    expect(checkPaperworkFile({ name: 'noext', mime: 'application/octet-stream', size: 1 })).toMatchObject({ ok: false });
  });

  it('prefers a supported declared type over a misleading extension', () => {
    expect(checkPaperworkFile({ name: 'really-a.png', mime: 'application/pdf', size: 1 })).toMatchObject({
      ok: true,
      mime: 'application/pdf',
      ext: 'pdf',
    });
  });

  it('treats NaN, Infinity and negative sizes as empty', () => {
    for (const size of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(checkPaperworkFile({ name: 'a.pdf', mime: 'application/pdf', size })).toEqual({ ok: false, reason: 'a.pdf is empty.' });
    }
  });

  it('reports the cleaned name in the reason and refuses a name that cleans to nothing', () => {
    expect(checkPaperworkFile({ name: '/tmp/"x".pdf', mime: 'application/pdf', size: 0 })).toEqual({ ok: false, reason: 'x.pdf is empty.' });
    expect(checkPaperworkFile({ name: ' ', mime: 'application/pdf', size: 1 })).toEqual({ ok: false, reason: 'The file needs a name.' });
  });
});

describe('cleanFileName edges', () => {
  it('strips tabs, newlines and DEL but keeps unicode and inner spaces', () => {
    expect(cleanFileName('call\tsheet\n v2.pdf')).toBe('callsheet v2.pdf');
    expect(cleanFileName('  Déjà vu – día 1.pdf  ')).toBe('Déjà vu – día 1.pdf');
  });

  it('keeps only the last path segment on mixed separators', () => {
    expect(cleanFileName('a/b\\c.pdf')).toBe('c.pdf');
    expect(cleanFileName('trailing/')).toBe('');
  });

  it('is exactly 200 characters at the boundary', () => {
    expect(cleanFileName('y'.repeat(200))).toHaveLength(200);
    expect(cleanFileName('y'.repeat(201))).toHaveLength(200);
  });
});

describe('formatBytes boundaries', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [10 * 1024 - 1, '10.0 KB'],
    [10 * 1024, '10 KB'],
    [1024 * 1024 - 1, '1024 KB'],
    [1024 * 1024, '1.0 MB'],
    [20 * 1024 * 1024, '20.0 MB'],
  ])('%i → %s', (n, label) => {
    expect(formatBytes(n)).toBe(label);
  });
});

describe('bucket config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults the bucket name and honours the override', () => {
    vi.stubEnv('PAPERWORK_BUCKET', '');
    expect(paperworkBucket()).toBe('paperwork');
    vi.stubEnv('PAPERWORK_BUCKET', 'docs-staging');
    expect(paperworkBucket()).toBe('docs-staging');
  });

  it('signs links for one minute', () => {
    expect(PAPERWORK_SIGNED_URL_SECONDS).toBe(60);
  });
});
