/**
 * A real, minimal PDF written by hand: one Letter page of Helvetica text. The
 * mock filler uses it so the demo path produces bytes any viewer opens, with
 * no PDF library. Non-ASCII characters are replaced, since the standard font
 * encoding has no glyphs for them.
 */
export function buildMockPdf(title: string, lines: string[]): Buffer {
  const content: string[] = [
    text(18, 72, 720, title),
    text(11, 72, 696, 'MOCK - filled by Prop Haus from the order profile. Not a vendor document.'),
  ];
  lines.slice(0, 40).forEach((line, i) => content.push(text(10, 72, 664 - i * 14, line)));
  const stream = content.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function text(size: number, x: number, y: number, s: string): string {
  const safe = s
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .slice(0, 110);
  return `BT /F1 ${size} Tf ${x} ${y} Td (${safe}) Tj ET`;
}
