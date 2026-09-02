import { describe, expect, it } from 'vitest';
import { composeOutreach, formatRentalWindow, textToHtml } from './compose';
import type { Vendor } from '../vendors';
import type { OrderProfile } from '../order-profile';
import { makeCartLine, READY_PROFILE } from '@/test/fixtures/orders';

const vendors: Record<string, Vendor> = {
  omega: { id: 'omega', name: 'Omega Cinema Props', city: 'LA', website: 'https://omegacinemaprops.com', tier: 'easy', orderEmail: 'orders@omegacinemaprops.com' },
  hpr: { id: 'hpr', name: 'Hand Prop Room', city: 'LA', website: 'https://www.hpr.com', tier: 'medium', orderEmail: 'orders@hpr.com' },
  artdimensions: { id: 'artdimensions', name: 'Art Dimensions Inc.', city: 'LA', website: 'https://example.com', tier: 'hard' },
};

const lines = [
  makeCartLine({ itemId: 'omega-1', source: 'omega', name: 'Walnut credenza', sourceUrl: 'https://omegacinemaprops.com/item/1' }),
  makeCartLine({ itemId: 'omega-2', source: 'omega', name: 'Brass floor lamp', sourceUrl: 'https://omegacinemaprops.com/item/2', image: undefined }),
  makeCartLine({ itemId: 'hpr-1', source: 'hpr', vendor: 'Hand Prop Room', name: 'Rotary phone', sourceUrl: 'https://www.hpr.com/item/9' }),
  makeCartLine({ itemId: 'ad-1', source: 'artdimensions', vendor: 'Art Dimensions Inc.', name: 'Gilt frame', sourceUrl: 'https://example.com/frame' }),
];

const withCoi: OrderProfile = {
  ...READY_PROFILE,
  company: { legalName: 'Nocturne Pictures LLC', dba: 'Nocturne' },
  contacts: {
    ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example', phone: '310 555 0100' },
    accountsPayable: { email: 'ap@nocturne.example' },
  },
  insurance: {
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    coiDocument: { storagePath: 'org/coi/abc.pdf', name: 'Nocturne-COI.pdf', uploadedAt: '2026-09-01T00:00:00Z' },
  },
};

const base = {
  lines,
  rentalStart: '2026-09-07',
  rentalEnd: '2026-09-14',
  deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
  deliveryNotes: 'Gate code 4321',
  vendors,
  fallbackTo: 'ops@prophaus.example',
};

describe('composeOutreach', () => {
  it('writes one draft per vendor, sorted by vendor name', () => {
    const drafts = composeOutreach({ ...base, profile: withCoi });
    expect(drafts.map((d) => d.vendorId)).toEqual(['artdimensions', 'hpr', 'omega']);
    expect(drafts.find((d) => d.vendorId === 'omega')!.items.map((i) => i.name)).toEqual([
      'Walnut credenza',
      'Brass floor lamp',
    ]);
  });

  it('addresses the vendor, cc AP, and replies to the ordering contact', () => {
    const omega = composeOutreach({ ...base, profile: withCoi }).find((d) => d.vendorId === 'omega')!;
    expect(omega.to).toBe('orders@omegacinemaprops.com');
    expect(omega.needsVendorAddress).toBe(false);
    expect(omega.cc).toEqual(['ap@nocturne.example']);
    expect(omega.replyTo).toBe('sam@nocturne.example');
    expect(omega.subject).toBe('Hold request · Nocturne · Sep 7 – Sep 14, 2026');
  });

  it('says who, what, when, where, paperwork, and the ask, in that order', () => {
    const omega = composeOutreach({ ...base, profile: withCoi }).find((d) => d.vendorId === 'omega')!;
    const t = omega.bodyText;
    const order = [
      'Hello Omega Cinema Props,',
      'Nocturne Pictures LLC (DBA Nocturne) would like to hold the following items. Sam Reyes is the ordering contact.',
      'Items\n1. Walnut credenza\n   https://omegacinemaprops.com/item/1\n2. Brass floor lamp',
      'Rental window\nSep 7 – Sep 14, 2026',
      'Deliver to\n4100 W Alameda Ave, Burbank, CA 91505\nGate code 4321',
      'Paperwork\nCOI on file attached.',
      'Please confirm availability and send a quote. Reply to this email.',
      'Sam Reyes\n310 555 0100\nsam@nocturne.example\nSent via Prop Haus on behalf of Nocturne Pictures LLC',
    ];
    let cursor = -1;
    for (const part of order) {
      const at = t.indexOf(part);
      expect(at, part).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(t).not.toMatch(/!/);
    expect(omega.attachments).toEqual([
      { name: 'Nocturne-COI.pdf', storagePath: 'org/coi/abc.pdf', contentType: 'application/pdf' },
    ]);
  });

  it('puts the item photo and link in the HTML version, same words', () => {
    const omega = composeOutreach({ ...base, profile: withCoi }).find((d) => d.vendorId === 'omega')!;
    expect(omega.bodyHtml).toContain('<img src="https://omegacinemaprops.com/img/12345.jpg"');
    expect(omega.bodyHtml).toContain('<a href="https://omegacinemaprops.com/item/2">Brass floor lamp</a>');
    expect(omega.bodyHtml).toContain('COI on file attached.');
    expect(omega.bodyHtml).toContain('Sent via Prop Haus on behalf of Nocturne Pictures LLC');
  });

  it('without a COI, names the broker and attaches nothing', () => {
    const profile: OrderProfile = {
      ...withCoi,
      insurance: { broker: { name: 'Marsh West', email: 'certs@marsh.example' } },
    };
    const hpr = composeOutreach({ ...base, profile }).find((d) => d.vendorId === 'hpr')!;
    expect(hpr.bodyText).toContain('Paperwork\nCOI to follow from our broker, Marsh West (certs@marsh.example).');
    expect(hpr.attachments).toEqual([]);

    const bare = composeOutreach({ ...base, profile: { ...profile, insurance: {} } }).find((d) => d.vendorId === 'hpr')!;
    expect(bare.bodyText).toContain('Paperwork\nCOI to follow.');
  });

  it('routes a vendor with no address to the ops mailbox with a flagged subject', () => {
    const ad = composeOutreach({ ...base, profile: withCoi }).find((d) => d.vendorId === 'artdimensions')!;
    expect(ad.to).toBe('ops@prophaus.example');
    expect(ad.needsVendorAddress).toBe(true);
    expect(ad.subject).toBe('[needs vendor address] Hold request · Nocturne · Sep 7 – Sep 14, 2026');
    expect(ad.warnings).toContain('No address on file for Art Dimensions Inc.. This goes to ops@prophaus.example.');

    const dropped = composeOutreach({ ...base, fallbackTo: undefined, profile: withCoi }).find(
      (d) => d.vendorId === 'artdimensions',
    )!;
    expect(dropped.to).toBe('');
  });

  it('warns about insurance gaps in the preview but never in the body', () => {
    const drafts = composeOutreach({
      ...base,
      profile: withCoi,
      minimums: {
        omega: {
          vendorId: 'omega',
          vendorName: 'Omega Cinema Props',
          glLimit: 2_000_000,
          aggregateLimit: 2_000_000,
          workersCompRequired: true,
          additionalInsuredRequired: false,
        },
      },
    });
    const omega = drafts.find((d) => d.vendorId === 'omega')!;
    expect(omega.warnings).toEqual([
      'GL limit too low: org has $1,000,000, vendor requires $2,000,000',
      'Vendor requires workers compensation coverage',
    ]);
    expect(omega.bodyText).not.toContain('GL limit');
    expect(drafts.find((d) => d.vendorId === 'hpr')!.warnings).toEqual([]);
  });

  it('attaches and names the forms MVP-12 filled for that vendor only', () => {
    const drafts = composeOutreach({
      ...base,
      profile: withCoi,
      documents: [
        { vendorId: 'omega', name: 'Omega rental agreement.pdf', storagePath: 'o/1.pdf', contentType: 'application/pdf' },
        { vendorId: 'omega', name: 'Omega credit application.pdf', storagePath: 'o/2.pdf', contentType: 'application/pdf' },
      ],
    });
    const omega = drafts.find((d) => d.vendorId === 'omega')!;
    expect(omega.bodyText).toContain(
      'COI on file attached.\nCompleted Omega rental agreement.pdf and Omega credit application.pdf attached.',
    );
    expect(omega.attachments.map((a) => a.name)).toEqual([
      'Nocturne-COI.pdf',
      'Omega rental agreement.pdf',
      'Omega credit application.pdf',
    ]);
    expect(drafts.find((d) => d.vendorId === 'hpr')!.attachments.map((a) => a.name)).toEqual(['Nocturne-COI.pdf']);
  });

  it('tolerates a profile with only the required fields and no dates', () => {
    const omega = composeOutreach({ lines, profile: READY_PROFILE, vendors }).find((d) => d.vendorId === 'omega')!;
    expect(omega.subject).toBe('Hold request · Nocturne Pictures LLC · Dates to be confirmed');
    expect(omega.bodyText).toContain('Deliver to\nTo be confirmed');
    expect(omega.cc).toEqual([]);
  });
});

describe('textToHtml', () => {
  it('turns an edited plain-text body into escaped paragraphs with live links', () => {
    expect(textToHtml('Hi <there>,\n\nSee https://x.example/a\nsecond line')).toBe(
      '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">\n' +
        '<p>Hi &lt;there&gt;,</p>\n<p>See <a href="https://x.example/a">https://x.example/a</a><br>second line</p>\n</div>',
    );
  });
});

describe('formatRentalWindow', () => {
  it('formats both, one, or neither date', () => {
    expect(formatRentalWindow('2026-09-07', '2026-09-14')).toBe('Sep 7 – Sep 14, 2026');
    expect(formatRentalWindow('2026-09-07')).toBe('From Sep 7, 2026');
    expect(formatRentalWindow(undefined, '2026-09-14')).toBe('Until Sep 14, 2026');
    expect(formatRentalWindow()).toBe('Dates to be confirmed');
  });
});
