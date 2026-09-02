import { describe, expect, it } from 'vitest';
import { buildMockPdf } from './mock-pdf';

describe('buildMockPdf', () => {
  it('writes a structurally valid single-page PDF with correct xref offsets', () => {
    const pdf = buildMockPdf('Rental agreement · Omega', ['companyName: Nocturne (Pictures) LLC', 'start: 09/07/2026']);
    const text = pdf.toString('latin1');

    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('MOCK - filled by Prop Haus');
    expect(text).toContain('Nocturne \\(Pictures\\) LLC');
    expect(text).not.toContain('·');

    const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    const offsets = [...text.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));

    const length = Number(text.match(/\/Length (\d+)/)![1]);
    const stream = text.match(/stream\n([\s\S]*?)\nendstream/)![1];
    expect(Buffer.byteLength(stream, 'latin1')).toBe(length);
  });
});
