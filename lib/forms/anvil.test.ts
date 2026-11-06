import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignaturePacketInput } from './filler';

const anvil = vi.hoisted(() => ({
  apiKeys: [] as string[],
  fillPDF: vi.fn(),
  createEtchPacket: vi.fn(),
  generateEtchSignUrl: vi.fn(),
  downloadDocuments: vi.fn(),
  prepareGraphQLFile: vi.fn((buf: Buffer, opts: { filename: string; contentType: string }) => ({ upload: buf, ...opts })),
}));

vi.mock('@anvilco/anvil', () => ({
  default: class {
    static prepareGraphQLFile = anvil.prepareGraphQLFile;
    fillPDF = anvil.fillPDF;
    createEtchPacket = anvil.createEtchPacket;
    generateEtchSignUrl = anvil.generateEtchSignUrl;
    downloadDocuments = anvil.downloadDocuments;
    constructor({ apiKey }: { apiKey: string }) {
      anvil.apiKeys.push(apiKey);
    }
  },
}));

import { AnvilFormFiller } from './anvil';

const PACKET = { eid: 'pkt-1', documentGroup: { eid: 'grp-1', signers: [{ eid: 'sgn-1' }] } };

function packetInput(over: Partial<SignaturePacketInput> = {}): SignaturePacketInput {
  return {
    templateEid: 'tmpl-1',
    signer: { name: 'Sam Reyes', email: 'sam@nocturne.example' },
    signerFields: ['signature', 'dateSigned'],
    data: { companyName: 'Nocturne Pictures LLC' },
    title: 'Rental agreement · Omega',
    orderRef: 'ABCD1234',
    ...over,
  };
}

let filler: AnvilFormFiller;

beforeEach(() => {
  for (const fn of [anvil.fillPDF, anvil.createEtchPacket, anvil.generateEtchSignUrl, anvil.downloadDocuments, anvil.prepareGraphQLFile]) {
    fn.mockClear();
  }
  anvil.apiKeys.length = 0;
  anvil.createEtchPacket.mockResolvedValue({ statusCode: 200, data: { data: { createEtchPacket: PACKET } } });
  anvil.generateEtchSignUrl.mockResolvedValue({ statusCode: 200, url: 'https://app.useanvil.com/sign/xyz' });
  delete process.env.ANVIL_ETCH_TEST;
  filler = new AnvilFormFiller('test-key');
});

afterEach(() => {
  delete process.env.ANVIL_ETCH_TEST;
});

it('authenticates the client with the given key', () => {
  expect(anvil.apiKeys).toEqual(['test-key']);
  expect(filler.name).toBe('anvil');
});

describe('fillPdf', () => {
  it('fills the template with the title and data and returns the bytes', async () => {
    anvil.fillPDF.mockResolvedValue({ statusCode: 200, data: Buffer.from('%PDF-filled') });
    const pdf = await filler.fillPdf({ templateEid: 'tmpl-1', title: 'Rental agreement', data: { a: '1' } });
    expect(anvil.fillPDF).toHaveBeenCalledWith('tmpl-1', { title: 'Rental agreement', data: { a: '1' } });
    expect(pdf.toString()).toBe('%PDF-filled');
  });

  it('refuses a form with no template, without calling Anvil', async () => {
    await expect(filler.fillPdf({ templateEid: null, title: 't', data: {} })).rejects.toThrow('no Anvil template eid');
    expect(anvil.fillPDF).not.toHaveBeenCalled();
  });

  it('throws with Anvil’s error messages on a non-200', async () => {
    anvil.fillPDF.mockResolvedValue({ statusCode: 422, errors: [{ message: 'bad field' }, 'raw error'] });
    await expect(filler.fillPdf({ templateEid: 'tmpl-1', title: 't', data: {} })).rejects.toThrow(
      'Anvil fill failed (422): bad field; raw error',
    );
  });

  it('throws when a 200 carries no bytes', async () => {
    anvil.fillPDF.mockResolvedValue({ statusCode: 200 });
    await expect(filler.fillPdf({ templateEid: 'tmpl-1', title: 't', data: {} })).rejects.toThrow(
      'Anvil fill failed (200): no detail',
    );
  });
});

describe('createSignaturePacket', () => {
  it('creates a live Etch packet with the user as the embedded signer', async () => {
    const packet = await filler.createSignaturePacket(packetInput());
    expect(packet).toEqual({ packetEid: 'pkt-1', documentGroupEid: 'grp-1', signUrl: 'https://app.useanvil.com/sign/xyz' });

    const { variables } = anvil.createEtchPacket.mock.calls[0][0];
    expect(variables).toMatchObject({
      name: 'Rental agreement · Omega · ABCD1234',
      isDraft: false,
      isTest: false,
      files: [{ id: 'form', castEid: 'tmpl-1' }],
      signers: [
        {
          id: 'signer',
          name: 'Sam Reyes',
          email: 'sam@nocturne.example',
          signerType: 'embedded',
          fields: [
            { fileId: 'form', fieldId: 'signature' },
            { fileId: 'form', fieldId: 'dateSigned' },
          ],
        },
      ],
      data: { payloads: { form: { data: { companyName: 'Nocturne Pictures LLC' } } } },
    });
    expect(anvil.generateEtchSignUrl).toHaveBeenCalledWith({
      variables: { signerEid: 'sgn-1', clientUserId: 'sam@nocturne.example' },
    });
  });

  it('never supplies a value for a signer field', async () => {
    await filler.createSignaturePacket(packetInput());
    const { variables } = anvil.createEtchPacket.mock.calls[0][0];
    const payload = variables.data.payloads.form.data as Record<string, string>;
    expect(Object.keys(payload)).not.toContain('signature');
    expect(Object.keys(payload)).not.toContain('dateSigned');
  });

  it('marks the packet as a test when ANVIL_ETCH_TEST=true', async () => {
    process.env.ANVIL_ETCH_TEST = 'true';
    await filler.createSignaturePacket(packetInput());
    expect(anvil.createEtchPacket.mock.calls[0][0].variables.isTest).toBe(true);
  });

  it('uploads the filled PDF when there is no template', async () => {
    const pdf = Buffer.from('%PDF-filled');
    await filler.createSignaturePacket(packetInput({ templateEid: null, pdf }));
    expect(anvil.prepareGraphQLFile).toHaveBeenCalledWith(pdf, { filename: 'ABCD1234.pdf', contentType: 'application/pdf' });
    const [file] = anvil.createEtchPacket.mock.calls[0][0].variables.files;
    expect(file).toMatchObject({ id: 'form', title: 'Rental agreement · Omega', file: { filename: 'ABCD1234.pdf' } });
  });

  it('refuses with neither a template nor a PDF', async () => {
    await expect(filler.createSignaturePacket(packetInput({ templateEid: null }))).rejects.toThrow(
      'needs a template eid or a filled PDF',
    );
    expect(anvil.createEtchPacket).not.toHaveBeenCalled();
  });

  it('throws with Anvil’s errors when the packet is not created', async () => {
    anvil.createEtchPacket.mockResolvedValue({ statusCode: 400, data: { data: {} }, errors: [{ message: 'cast not found' }] });
    await expect(filler.createSignaturePacket(packetInput())).rejects.toThrow('Anvil createEtchPacket failed: cast not found');
    expect(anvil.generateEtchSignUrl).not.toHaveBeenCalled();
  });

  it('throws when the sign URL cannot be generated', async () => {
    anvil.generateEtchSignUrl.mockResolvedValue({ statusCode: 500, errors: 'upstream down' });
    await expect(filler.createSignaturePacket(packetInput())).rejects.toThrow('Anvil generateEtchSignUrl failed: upstream down');
  });

  it('returns no sign URL when the packet has no signer', async () => {
    anvil.createEtchPacket.mockResolvedValue({
      statusCode: 200,
      data: { data: { createEtchPacket: { eid: 'pkt-2', documentGroup: { eid: 'grp-2', signers: [] } } } },
    });
    expect(await filler.createSignaturePacket(packetInput())).toEqual({ packetEid: 'pkt-2', documentGroupEid: 'grp-2', signUrl: undefined });
    expect(anvil.generateEtchSignUrl).not.toHaveBeenCalled();
  });
});

describe('downloadSigned', () => {
  it('returns the document group as a zip', async () => {
    anvil.downloadDocuments.mockResolvedValue({ statusCode: 200, data: Buffer.from('PK-zip') });
    const signed = await filler.downloadSigned('grp-1');
    expect(anvil.downloadDocuments).toHaveBeenCalledWith('grp-1');
    expect(signed).toEqual({ bytes: Buffer.from('PK-zip'), contentType: 'application/zip', ext: 'zip' });
  });

  it('throws on a failed download', async () => {
    anvil.downloadDocuments.mockResolvedValue({ statusCode: 404, errors: [{ message: 'not found' }] });
    await expect(filler.downloadSigned('grp-1')).rejects.toThrow('Anvil download failed (404): not found');
  });
});
