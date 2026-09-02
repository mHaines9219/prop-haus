import { describe, expect, it } from 'vitest';
import type { OrderProfile } from '@/lib/order-profile';
import type { Order } from '@/lib/orders';
import { humanize, resolveFieldMap } from './map';

const profile: OrderProfile = {
  company: {
    legalName: 'Nocturne Pictures LLC',
    entityType: 'llc',
    address: { line1: '4100 W Alameda Ave', line2: 'Stage 3', city: 'Burbank', state: 'CA', zip: '91505' },
  },
  contacts: { ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example' } },
  defaults: { rentalWindowDays: 7 },
  insurance: { carrier: 'Hiscox', glLimit: 1_000_000, expiresAt: '2027-03-31', additionalInsuredAvailable: true },
  authorization: { formsOnBehalf: true },
};

const order: Order = {
  id: 'a1b2c3d4-0000-4000-8000-000000000000',
  orgId: 'org',
  status: 'placed',
  rentalStart: '2026-09-07',
  rentalEnd: '2026-09-14',
  deliveryAddress: { line1: '1 Stage Rd', city: 'Los Angeles', state: 'CA', zip: '90028' },
  items: [
    { id: 'i1', itemId: 'omega-1', source: 'omega', sourceId: '1', name: 'Walnut credenza', sourceUrl: 'x', vendor: 'Omega Cinema Props', status: 'pending' },
    { id: 'i2', itemId: 'omega-2', source: 'omega', sourceId: '2', name: 'Brass lamp (pair)', sourceUrl: 'x', vendor: 'Omega Cinema Props', status: 'pending' },
  ],
  createdAt: '2026-09-02T10:00:00Z',
  updatedAt: '2026-09-02T10:00:00Z',
};

const ctx = {
  profile,
  order,
  vendor: { id: 'omega', name: 'Omega Cinema Props', additionalInsuredWording: 'Omega, its officers and agents' },
  form: { kind: 'rental_agreement', label: 'Rental agreement' },
};

describe('resolveFieldMap', () => {
  it('resolves profile, order, vendor and form paths with the default formats', () => {
    const { data, missing } = resolveFieldMap(
      {
        companyName: 'company.legalName',
        entity: 'company.entityType',
        companyAddress: 'company.address',
        contactEmail: 'contacts.ordering.email',
        glLimit: 'insurance.glLimit',
        aiAvailable: 'insurance.additionalInsuredAvailable',
        expires: 'insurance.expiresAt',
        start: '$order.rentalStart',
        deliverTo: '$order.deliveryAddress',
        ref: '$order.ref',
        count: '$order.itemCount',
        items: '$order.itemList',
        aiWording: '$vendor.additionalInsuredWording',
        formLabel: '$form.label',
      },
      ctx,
    );
    expect(data).toEqual({
      companyName: 'Nocturne Pictures LLC',
      entity: 'llc',
      companyAddress: '4100 W Alameda Ave Stage 3, Burbank, CA 91505',
      contactEmail: 'sam@nocturne.example',
      glLimit: '1000000',
      aiAvailable: 'Yes',
      expires: '03/31/2027',
      start: '09/07/2026',
      deliverTo: '1 Stage Rd, Los Angeles, CA 90028',
      ref: 'A1B2C3D4',
      count: '2',
      items: 'Walnut credenza; Brass lamp (pair)',
      aiWording: 'Omega, its officers and agents',
      formLabel: 'Rental agreement',
    });
    expect(missing).toEqual([]);
  });

  it('honors a per-alias date format', () => {
    const { data } = resolveFieldMap({ expires: 'insurance.expiresAt|date:YYYY-MM-DD', start: '$order.rentalStart | date:DD.MM.YYYY' }, ctx);
    expect(data).toEqual({ expires: '2027-03-31', start: '07.09.2026' });
  });

  it('names the blanks in human words and leaves them out of data', () => {
    const { data, missing } = resolveFieldMap(
      { companyName: 'company.legalName', fax: 'company.fax', apEmail: 'contacts.accountsPayable.email', dba: 'company.dba' },
      ctx,
    );
    expect(data).toEqual({ companyName: 'Nocturne Pictures LLC' });
    expect(missing).toEqual(['Fax', 'Ap email', 'Dba']);
  });

  it('leaves $signer fields to the signer: not in data, not missing', () => {
    const { data, missing, signerFields } = resolveFieldMap(
      { companyName: 'company.legalName', ein: '$signer.ein', signature: '$signer.signature', dateSigned: '$signer.dateSigned' },
      ctx,
    );
    expect(data).toEqual({ companyName: 'Nocturne Pictures LLC' });
    expect(missing).toEqual([]);
    expect(signerFields).toEqual(['ein', 'signature', 'dateSigned']);
  });

  it('treats an unknown namespace or a dead path as blank rather than throwing', () => {
    const { data, missing } = resolveFieldMap({ a: '$nope.x', b: 'company.address.line9', c: 'contacts.ordering.name.first' }, ctx);
    expect(data).toEqual({});
    expect(missing).toEqual(['A', 'B', 'C']);
  });
});

describe('humanize', () => {
  it.each([
    ['contactPhone', 'Contact phone'],
    ['apEmail', 'Ap email'],
    ['ein', 'Ein'],
    ['legal_name', 'Legal name'],
    ['glLimit', 'Gl limit'],
  ])('%s → %s', (alias, label) => {
    expect(humanize(alias)).toBe(label);
  });
});
