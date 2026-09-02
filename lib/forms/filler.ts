/**
 * The form-filler seam. Anvil fills PDF templates and runs e-signatures; the
 * mock does the same locally so the whole flow demos with zero secrets.
 *
 * Env (see .env.local.example):
 *   FORMS_PROVIDER=mock|anvil   default mock
 *   FORMS=off                   skip paperwork at checkout entirely
 *   ANVIL_API_KEY               Anvil organization API key (dev keys watermark)
 *   ANVIL_WEBHOOK_SECRET        the token Anvil sends with each webhook call
 *
 * Prop Haus fills data fields only. Signatures, initials, and signing dates are
 * always the signer's own, inside the Anvil session.
 */

import { buildMockPdf } from './mock-pdf';

export type FillPdfInput = {
  templateEid: string | null;
  title: string;
  data: Record<string, string>;
};

export type SignaturePacketInput = {
  templateEid: string | null;
  /** The filled PDF, used when there is no template to reference. */
  pdf?: Buffer;
  signer: { name: string; email: string };
  /** Aliases the signer completes (signature, dateSigned, ein, ...). */
  signerFields: string[];
  data: Record<string, string>;
  title: string;
  orderRef: string;
  /** Where the mock's sign page lives; ignored by Anvil. */
  mockSignPath?: string;
};

export type SignaturePacket = {
  packetEid: string;
  documentGroupEid: string;
  signUrl?: string;
};

export type SignedDownload = { bytes: Buffer; contentType: string; ext: string };

export interface FormFiller {
  readonly name: 'mock' | 'anvil';
  fillPdf(input: FillPdfInput): Promise<Buffer>;
  createSignaturePacket(input: SignaturePacketInput): Promise<SignaturePacket>;
  downloadSigned(documentGroupEid: string): Promise<SignedDownload>;
}

export class MockFormFiller implements FormFiller {
  readonly name = 'mock' as const;

  async fillPdf({ title, data }: FillPdfInput): Promise<Buffer> {
    const lines = Object.entries(data).map(([alias, value]) => `${alias}: ${value}`);
    return buildMockPdf(title, lines);
  }

  async createSignaturePacket(input: SignaturePacketInput): Promise<SignaturePacket> {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    return {
      packetEid: `mock-packet-${id}`,
      documentGroupEid: `mock-group-${id}`,
      signUrl: input.mockSignPath ? `${input.mockSignPath}?mock=1` : undefined,
    };
  }

  async downloadSigned(documentGroupEid: string): Promise<SignedDownload> {
    return {
      bytes: buildMockPdf('Signed copy', [`document group ${documentGroupEid}`, 'MOCK signature applied by the signer']),
      contentType: 'application/pdf',
      ext: 'pdf',
    };
  }
}

export function formsProvider(): 'mock' | 'anvil' {
  return process.env.FORMS_PROVIDER === 'anvil' ? 'anvil' : 'mock';
}

export function formsEnabled(): boolean {
  return process.env.FORMS !== 'off';
}

let cached: FormFiller | null = null;

/** The configured filler. Anvil only when FORMS_PROVIDER=anvil and a key is set. */
export async function formFiller(): Promise<FormFiller> {
  if (cached) return cached;
  if (formsProvider() === 'anvil' && process.env.ANVIL_API_KEY) {
    const { AnvilFormFiller } = await import('./anvil');
    cached = new AnvilFormFiller(process.env.ANVIL_API_KEY);
  } else {
    cached = new MockFormFiller();
  }
  return cached;
}
