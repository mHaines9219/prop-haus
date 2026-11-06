import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';
import { makeCartLine, READY_PROFILE } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { LogMailer } from '@/lib/mail/provider';
import type { Draft } from '@/lib/outreach/compose';
import type { OrderReadiness } from '@/lib/order-profile';
import { POST } from './route';

type Preview = { drafts: Draft[]; readiness: OrderReadiness };

const heritageLine = makeCartLine({
  itemId: 'heritage-9',
  source: 'heritage',
  sourceId: '9',
  name: 'Brass floor lamp',
  sourceUrl: 'https://heritagepropsla.com/item/9',
  vendor: 'Heritage Props',
});
const body = {
  lines: [makeCartLine(), heritageLine],
  rentalStart: '2026-12-01',
  rentalEnd: '2026-12-08',
};

const preview = (b: unknown) => POST(jsonRequest('/api/checkout/preview', b));

beforeEach(() => {
  db.reset();
  signIn();
  vi.stubEnv('OUTREACH_FALLBACK_TO', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/checkout/preview', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await preview(body);
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it.each([[[]], [undefined], ['not-a-list']])('400 when lines is %j', async (lines) => {
    const res = await preview({ lines });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'cart is empty' });
  });

  it('400 for a malformed JSON body', async () => {
    const res = await POST(rawRequest('/api/checkout/preview', '{not json'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid JSON' });
  });

  it('400 for a line with a javascript: link', async () => {
    const res = await preview({ ...body, lines: [makeCartLine({ sourceUrl: 'javascript:alert(1)' })] });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'a cart line is invalid' });
  });

  it('400 for more lines than one checkout takes', async () => {
    const lines = Array.from({ length: 201 }, (_, i) => makeCartLine({ itemId: `omega-${i}` }));
    const res = await preview({ ...body, lines });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'a cart line is invalid' });
  });

  it('ignores delivery notes that are not a string', async () => {
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
    const res = await preview({ ...body, deliveryNotes: { $gt: '' } });
    expect(res.status).toBe(200);
    expect((await readJson<Preview>(res)).drafts).toHaveLength(2);
  });

  it('drafts one email per vendor from the cart and the profile, and writes and sends nothing', async () => {
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
    const send = vi.spyOn(LogMailer.prototype, 'send');

    const res = await preview({ ...body, shootDetails: '  Kitchen scene, period dressing  ' });

    expect(res.status).toBe(200);
    const { drafts, readiness } = await readJson<Preview>(res);
    expect(readiness).toEqual({ ready: true, missing: [] });
    expect(drafts.map((d) => [d.vendorId, d.to, d.replyTo]).sort()).toEqual([
      ['heritage', 'orders@heritagepropsla.com', 'sam@nocturne.example'],
      ['omega', 'orders@omegacinemaprops.com', 'sam@nocturne.example'],
    ]);
    const omega = drafts.find((d) => d.vendorId === 'omega')!;
    expect(omega.subject).toBe('Hold request · Nocturne Pictures LLC · Dec 1 – Dec 8, 2026');
    expect(omega.bodyText).toContain('Mid-century walnut credenza');
    expect(omega.bodyText).toContain('Kitchen scene, period dressing');
    expect(omega.bodyText).not.toContain('Brass floor lamp');

    expect(send).not.toHaveBeenCalled();
    expect(db.log.filter((l) => l.op !== 'select')).toEqual([]);
  });

  it("fills the rental window from the profile's default when the cart sends none", async () => {
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
    const { drafts } = await readJson<Preview>(await preview({ lines: [makeCartLine()] }));
    expect(drafts[0].subject).toMatch(/^Hold request · Nocturne Pictures LLC · \w{3} \d+ – /);
  });

  it('previews the cart production fields without saving them to the profile', async () => {
    const res = await preview({
      ...body,
      production: {
        legalName: 'Lamplight Films LLC',
        contactName: 'Ari Cole',
        contactEmail: 'ari@lamplight.example',
        formsOnBehalf: true,
      },
    });

    const { drafts, readiness } = await readJson<Preview>(res);
    expect(readiness.ready).toBe(true);
    expect(drafts[0].subject).toContain('Lamplight Films LLC');
    expect(drafts[0].replyTo).toBe('ari@lamplight.example');
    expect(db.log.filter((l) => l.op !== 'select')).toEqual([]);
  });

  it('reports what the profile is missing', async () => {
    const { readiness } = await readJson<Preview>(await preview(body));
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(
      expect.arrayContaining(['Company legal name', 'Ordering contact email', 'Authorization to complete forms']),
    );
  });

  function seedOmegaMinimum() {
    db.seed('vendor_insurance_minimums', [
      {
        vendor_id: 'omega',
        vendor_name: 'Omega Cinema Props',
        gl_limit: 2_000_000,
        aggregate_limit: null,
        workers_comp_required: false,
        additional_insured_required: false,
        notes: null,
      },
    ]);
  }

  it("warns when the production's coverage falls short of a vendor's minimums", async () => {
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
    seedOmegaMinimum();
    const { drafts } = await readJson<Preview>(await preview(body));
    expect(drafts.find((d) => d.vendorId === 'omega')!.warnings.length).toBeGreaterThan(0);
    expect(drafts.find((d) => d.vendorId === 'heritage')!.warnings).toEqual([]);
  });

  it('drafts the booking-flow inquiry for a sandbox session, where the fallback insurer writes to the house terms', async () => {
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
    seedOmegaMinimum();
    const live = await readJson<Preview>(await preview(body));
    signIn({ isAdmin: true, sandbox: true });
    const sandbox = await readJson<Preview>(await preview(body));

    const omegaLive = live.drafts.find((d) => d.vendorId === 'omega')!;
    const omegaSandbox = sandbox.drafts.find((d) => d.vendorId === 'omega')!;
    expect(omegaLive.warnings.length).toBeGreaterThan(0);
    expect(omegaSandbox.warnings).toEqual([]);
    expect(omegaSandbox.bodyText).not.toBe(omegaLive.bodyText);
  });

  it('addresses a house with no order email to the fallback and says so', async () => {
    vi.stubEnv('OUTREACH_FALLBACK_TO', 'ops@prophaus.example');
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
    const line = makeCartLine({ itemId: 'artdimensions-4', source: 'artdimensions', sourceId: '4', vendor: 'Art Dimensions' });
    const { drafts } = await readJson<Preview>(await preview({ ...body, lines: [line] }));
    expect(drafts[0]).toMatchObject({ to: 'ops@prophaus.example', needsVendorAddress: true });
    expect(drafts[0].subject).toMatch(/^\[needs vendor address\]/);
  });
});
