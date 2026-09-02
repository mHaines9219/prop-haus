import { describe, expect, it } from 'vitest';
import { fileOf } from '@/test/helpers/request';
import { parseAttachments } from './upload';

/**
 * Moodboard uploads become base64 data URLs handed to a vision model. The
 * limits and the mime fallback are what keep a 9 MB PDF or a .exe out.
 */

function formWith(...files: Array<File | string>) {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  return form;
}

const MB = 1024 * 1024;

describe('parseAttachments', () => {
  it('returns no attachments for an empty form', async () => {
    await expect(parseAttachments(new FormData())).resolves.toEqual({ attachments: [] });
  });

  it('ignores non-file entries under the files key', async () => {
    await expect(parseAttachments(formWith('just text'))).resolves.toEqual({ attachments: [] });
  });

  it('encodes an image as a data url with its declared mime', async () => {
    const { attachments, error } = await parseAttachments(formWith(fileOf('board.png', 'image/png', new Uint8Array([1, 2, 3]))));
    expect(error).toBeUndefined();
    expect(attachments).toEqual([
      { kind: 'image', mime: 'image/png', filename: 'board.png', dataUrl: 'data:image/png;base64,AQID' },
    ]);
  });

  it('classifies a PDF as pdf', async () => {
    const { attachments } = await parseAttachments(formWith(fileOf('deck.pdf', 'application/pdf', 4)));
    expect(attachments[0]).toMatchObject({ kind: 'pdf', mime: 'application/pdf', filename: 'deck.pdf' });
    expect(attachments[0].dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it.each([
    ['a.png', 'image/png'],
    ['a.jpg', 'image/jpeg'],
    ['a.JPEG', 'image/jpeg'],
    ['a.webp', 'image/webp'],
    ['a.gif', 'image/gif'],
    ['a.pdf', 'application/pdf'],
  ])('guesses the mime for %s from its extension when the browser sends none', async (name, mime) => {
    const { attachments } = await parseAttachments(formWith(fileOf(name, '', 1)));
    expect(attachments[0].mime).toBe(mime);
  });

  it('refuses a file with no type and an unknown extension', async () => {
    await expect(parseAttachments(formWith(fileOf('notes.txt', '', 1)))).resolves.toEqual({
      attachments: [],
      error: 'Unsupported file type for notes.txt: application/octet-stream',
    });
  });

  it('refuses an unsupported declared type even with a friendly extension', async () => {
    const res = await parseAttachments(formWith(fileOf('board.png', 'text/html', 1)));
    expect(res).toEqual({ attachments: [], error: 'Unsupported file type for board.png: text/html' });
  });

  it('accepts image/jpg as an alias', async () => {
    const { attachments } = await parseAttachments(formWith(fileOf('a.jpg', 'image/jpg', 1)));
    expect(attachments[0]).toMatchObject({ kind: 'image', mime: 'image/jpg' });
  });

  it('accepts exactly 8 MB and refuses one byte more', async () => {
    const ok = await parseAttachments(formWith(fileOf('big.png', 'image/png', 8 * MB)));
    expect(ok.error).toBeUndefined();
    expect(ok.attachments).toHaveLength(1);

    const over = await parseAttachments(formWith(fileOf('huge.png', 'image/png', 8 * MB + 1)));
    expect(over).toEqual({ attachments: [], error: 'huge.png is too large (>8MB)' });
  });

  it('accepts six files and refuses seven, before reading any of them', async () => {
    const six = Array.from({ length: 6 }, (_, i) => fileOf(`${i}.png`, 'image/png', 1));
    expect((await parseAttachments(formWith(...six))).attachments).toHaveLength(6);

    const seven = [...six, fileOf('7.png', 'image/png', 1)];
    await expect(parseAttachments(formWith(...seven))).resolves.toEqual({
      attachments: [],
      error: 'Too many files (max 6)',
    });
  });

  it('drops everything when one file in the batch is bad', async () => {
    const res = await parseAttachments(formWith(fileOf('ok.png', 'image/png', 1), fileOf('bad.zip', 'application/zip', 1)));
    expect(res.attachments).toEqual([]);
    expect(res.error).toMatch(/bad\.zip/);
  });
});
