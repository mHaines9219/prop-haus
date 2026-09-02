import { describe, expect, it } from 'vitest';
import {
  MAX_PAPERWORK_BYTES,
  checkPaperworkFile,
  cleanFileName,
  documentTypeLabel,
  formatBytes,
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
