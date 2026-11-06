import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFormFiller, formsEnabled, formsProvider } from './filler';

const anvilCtor = vi.hoisted(() => vi.fn());
vi.mock('./anvil', () => ({
  AnvilFormFiller: class {
    readonly name = 'anvil';
    constructor(apiKey: string) {
      anvilCtor(apiKey);
    }
  },
}));

const ENV_KEYS = ['FORMS_PROVIDER', 'FORMS', 'ANVIL_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  anvilCtor.mockClear();
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function freshFiller() {
  return (await import('./filler')).formFiller();
}

describe('MockFormFiller', () => {
  const filler = new MockFormFiller();

  it('fills a PDF that prints each alias and value under the title', async () => {
    const pdf = await filler.fillPdf({
      templateEid: null,
      title: 'Rental agreement',
      data: { companyName: 'Nocturne Pictures LLC', start: '09/07/2026' },
    });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Rental agreement');
    expect(text).toContain('companyName: Nocturne Pictures LLC');
    expect(text).toContain('start: 09/07/2026');
  });

  it('opens a signature packet whose sign link is the mock sign page', async () => {
    const packet = await filler.createSignaturePacket({
      templateEid: null,
      signer: { name: 'Sam Reyes', email: 'sam@nocturne.example' },
      signerFields: ['signature'],
      data: {},
      title: 'Rental agreement',
      orderRef: 'ORDER1',
      mockSignPath: '/orders/o/sign/d',
    });
    expect(packet.packetEid).toMatch(/^mock-packet-[0-9a-f]{20}$/);
    expect(packet.documentGroupEid).toMatch(/^mock-group-[0-9a-f]{20}$/);
    expect(packet.packetEid.slice(-20)).toBe(packet.documentGroupEid.slice(-20));
    expect(packet.signUrl).toBe('/orders/o/sign/d?mock=1');
  });

  it('gives each packet its own eid and no sign link without a sign page', async () => {
    const input = { templateEid: null, signer: { name: 'a', email: 'b' }, signerFields: [], data: {}, title: 't', orderRef: 'r' };
    const a = await filler.createSignaturePacket(input);
    const b = await filler.createSignaturePacket(input);
    expect(a.packetEid).not.toBe(b.packetEid);
    expect(a.signUrl).toBeUndefined();
  });

  it('returns a signed copy as a PDF naming the document group', async () => {
    const signed = await filler.downloadSigned('mock-group-abc');
    expect(signed.contentType).toBe('application/pdf');
    expect(signed.ext).toBe('pdf');
    expect(signed.bytes.toString('latin1')).toContain('document group mock-group-abc');
  });
});

describe('provider switches', () => {
  it('defaults to the mock provider with forms on', () => {
    expect(formsProvider()).toBe('mock');
    expect(formsEnabled()).toBe(true);
  });

  it('reads FORMS_PROVIDER=anvil and FORMS=off', () => {
    process.env.FORMS_PROVIDER = 'anvil';
    process.env.FORMS = 'off';
    expect(formsProvider()).toBe('anvil');
    expect(formsEnabled()).toBe(false);
  });

  it('treats any other provider value as mock', () => {
    process.env.FORMS_PROVIDER = 'docusign';
    expect(formsProvider()).toBe('mock');
  });
});

describe('formFiller', () => {
  it('is the mock with no configuration', async () => {
    const filler = await freshFiller();
    expect(filler.name).toBe('mock');
    expect(anvilCtor).not.toHaveBeenCalled();
  });

  it('stays the mock when Anvil is chosen but no key is set', async () => {
    process.env.FORMS_PROVIDER = 'anvil';
    expect((await freshFiller()).name).toBe('mock');
    expect(anvilCtor).not.toHaveBeenCalled();
  });

  it('stays the mock when a key is set but the provider is not Anvil', async () => {
    process.env.ANVIL_API_KEY = 'test-key';
    expect((await freshFiller()).name).toBe('mock');
  });

  it('is Anvil, built with the key, when both are set', async () => {
    process.env.FORMS_PROVIDER = 'anvil';
    process.env.ANVIL_API_KEY = 'test-key';
    const filler = await freshFiller();
    expect(filler.name).toBe('anvil');
    expect(anvilCtor).toHaveBeenCalledWith('test-key');
  });

  it('builds the filler once per process', async () => {
    const mod = await import('./filler');
    const a = await mod.formFiller();
    process.env.FORMS_PROVIDER = 'anvil';
    process.env.ANVIL_API_KEY = 'test-key';
    expect(await mod.formFiller()).toBe(a);
  });
});
