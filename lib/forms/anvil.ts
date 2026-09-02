/**
 * Anvil adapter (useanvil.com). PDF fill via the REST fill endpoint, e-sign via
 * an Etch packet with an EMBEDDED signer so the user signs in-product. Only
 * loaded when FORMS_PROVIDER=anvil and ANVIL_API_KEY is set.
 *
 * The signer's fields (signature, dateSigned, ein, ...) are the `$signer.*`
 * aliases from the field map: Anvil collects them from the user inside the
 * session. Prop Haus never supplies a signature value.
 */

import Anvil from '@anvilco/anvil';
import type {
  FillPdfInput,
  FormFiller,
  SignaturePacket,
  SignaturePacketInput,
  SignedDownload,
} from './filler';

const FILE_ID = 'form';

type EtchPacketResult = {
  eid: string;
  documentGroup: { eid: string; signers: Array<{ eid: string }> };
};

export class AnvilFormFiller implements FormFiller {
  readonly name = 'anvil' as const;
  private client: Anvil;

  constructor(apiKey: string) {
    this.client = new Anvil({ apiKey });
  }

  async fillPdf({ templateEid, title, data }: FillPdfInput): Promise<Buffer> {
    if (!templateEid) throw new Error('no Anvil template eid for this form');
    const res = await this.client.fillPDF(templateEid, { title, data });
    if (res.statusCode !== 200 || !res.data) {
      throw new Error(`Anvil fill failed (${res.statusCode}): ${describe(res.errors)}`);
    }
    return Buffer.from(res.data as Buffer);
  }

  async createSignaturePacket(input: SignaturePacketInput): Promise<SignaturePacket> {
    const file = input.templateEid
      ? { id: FILE_ID, castEid: input.templateEid }
      : input.pdf
        ? {
            id: FILE_ID,
            title: input.title,
            file: Anvil.prepareGraphQLFile(input.pdf, { filename: `${input.orderRef}.pdf`, contentType: 'application/pdf' }),
          }
        : null;
    if (!file) throw new Error('a signature packet needs a template eid or a filled PDF');

    const res = await this.client.createEtchPacket({
      variables: {
        name: `${input.title} · ${input.orderRef}`,
        isDraft: false,
        isTest: process.env.ANVIL_ETCH_TEST === 'true',
        files: [file],
        signers: [
          {
            id: 'signer',
            name: input.signer.name,
            email: input.signer.email,
            signerType: 'embedded',
            fields: input.signerFields.map((fieldId) => ({ fileId: FILE_ID, fieldId })),
          },
        ],
        data: { payloads: { [FILE_ID]: { data: input.data } } },
      },
      responseQuery: 'eid documentGroup { eid signers { eid } }',
    });
    const packet = (res.data as { data?: { createEtchPacket?: EtchPacketResult } })?.data?.createEtchPacket;
    if (!packet) throw new Error(`Anvil createEtchPacket failed: ${describe(res.errors)}`);

    const signerEid = packet.documentGroup.signers[0]?.eid;
    let signUrl: string | undefined;
    if (signerEid) {
      const urlRes = await this.client.generateEtchSignUrl({
        variables: { signerEid, clientUserId: input.signer.email },
      });
      if (!urlRes.url) throw new Error(`Anvil generateEtchSignUrl failed: ${describe(urlRes.errors)}`);
      signUrl = urlRes.url;
    }

    return { packetEid: packet.eid, documentGroupEid: packet.documentGroup.eid, signUrl };
  }

  async downloadSigned(documentGroupEid: string): Promise<SignedDownload> {
    const res = await this.client.downloadDocuments(documentGroupEid);
    if (res.statusCode !== 200 || !res.data) {
      throw new Error(`Anvil download failed (${res.statusCode}): ${describe(res.errors)}`);
    }
    return { bytes: Buffer.from(res.data as Buffer), contentType: 'application/zip', ext: 'zip' };
  }
}

function describe(errors: unknown): string {
  if (!errors) return 'no detail';
  return Array.isArray(errors)
    ? errors.map((e) => (e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e))).join('; ')
    : String(errors);
}
