import { z } from 'zod';

const Endorsement = z.enum([
  'waiver-of-subrogation',
  'primary-non-contributory',
  'blanket-additional-insured',
]);

export const ParsedCoi = z.object({
  companyName: z.string().nullable(),
  address: z.string().nullable(),
  carrier: z.string().nullable(),
  policyNumber: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  expirationDate: z.string().nullable(),
  brokerName: z.string().nullable(),
  brokerEmail: z.string().nullable(),
  brokerPhone: z.string().nullable(),
  glPerOccurrence: z.number().nullable(),
  glAggregate: z.number().nullable(),
  autoLiability: z.number().nullable(),
  endorsements: z.array(Endorsement),
  notes: z.string().nullable(),
});
export type ParsedCoi = z.infer<typeof ParsedCoi>;

const SYSTEM = `You extract structured data from a Certificate of Insurance (typically an ACORD 25 form) PDF.

Return ONLY a JSON object matching this shape, no markdown:
{
  "companyName": string | null,        // INSURED name (NOT the certificate holder)
  "address": string | null,            // INSURED address, one line
  "carrier": string | null,            // primary INSURER name (e.g. "The Hartford")
  "policyNumber": string | null,       // primary GL policy number
  "effectiveDate": string | null,      // ISO YYYY-MM-DD
  "expirationDate": string | null,     // ISO YYYY-MM-DD
  "brokerName": string | null,         // PRODUCER firm or contact
  "brokerEmail": string | null,        // PRODUCER email (often in CONTACT box)
  "brokerPhone": string | null,
  "glPerOccurrence": number | null,    // GL "EACH OCCURRENCE" limit in dollars (number, no commas)
  "glAggregate": number | null,        // GL "GENERAL AGGREGATE" limit in dollars
  "autoLiability": number | null,      // AUTOMOBILE LIABILITY "COMBINED SINGLE LIMIT" in dollars
  "endorsements": Array<"waiver-of-subrogation" | "primary-non-contributory" | "blanket-additional-insured">,
  "notes": string | null               // any relevant note from the REMARKS section
}

Rules:
- The INSURED is at the top-right area. The CERTIFICATE HOLDER (bottom box) is NOT the insured — ignore that box for company info.
- If a value is missing or unreadable, return null. Do not invent.
- Limits: read the printed numeric value, drop commas and dollar signs (e.g. "$1,000,000" → 1000000).
- Dates: convert any format to ISO YYYY-MM-DD.
- Endorsements: include "waiver-of-subrogation" if the Waiver of Subrogation box is checked OR the REMARKS section explicitly states it applies. Same logic for "primary-non-contributory" and for blanket additional insured wording.
- Return an empty array for endorsements if none are confirmed. Do not assume.`;

export async function parseCoiPdf(base64Pdf: string, filename = 'coi.pdf'): Promise<ParsedCoi> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const model = process.env.OPENROUTER_COI_MODEL || 'google/gemini-2.5-flash';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'x-title': process.env.OPENROUTER_APP_NAME || 'prop-haus',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the structured fields from this COI PDF.' },
            {
              type: 'file',
              file: {
                filename,
                file_data: `data:application/pdf;base64,${base64Pdf}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 400)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '';
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model returned non-JSON: ${content.slice(0, 200)}`);
  }
  return ParsedCoi.parse(raw);
}
