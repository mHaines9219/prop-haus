import { describe, expect, it } from 'vitest';
import {
  AUTHORIZATION_SENTENCE,
  EMPTY_ORDER_PROFILE,
  defaultRentalWindow,
  formatAddress,
  isCompleteAddress,
  normalizeAddress,
  normalizeOrderProfile,
  orderDefaults,
  orderReadiness,
  orderRequestReadiness,
  applyProductionPatch,
  normalizeProductionPatch,
  productionSummary,
  type OrderProfile,
} from './order-profile';

const READY: OrderProfile = {
  company: { legalName: 'Nocturne Pictures LLC' },
  contacts: { ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example' } },
  defaults: {
    rentalWindowDays: 7,
    deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
  },
  insurance: {},
  authorization: { formsOnBehalf: true, acceptedAt: '2026-09-02T10:00:00Z' },
};

describe('orderReadiness', () => {
  it('lists every gap on an empty profile, in the order the page shows them', () => {
    expect(orderReadiness(EMPTY_ORDER_PROFILE)).toEqual({
      ready: false,
      missing: [
        'Company legal name',
        'Ordering contact name',
        'Ordering contact email',
        'Authorization to complete forms',
      ],
    });
  });

  it('is ready without any insurance on file', () => {
    expect(orderReadiness(READY)).toEqual({ ready: true, missing: [] });
  });

  it('does not need delivery defaults: the cart form asks for dates and location per order', () => {
    expect(orderReadiness({ ...READY, defaults: {} })).toEqual({ ready: true, missing: [] });
  });
});

describe('the production half of the cart form', () => {
  it('summarises what the profile already has, without blanks', () => {
    expect(productionSummary(EMPTY_ORDER_PROFILE)).toEqual({ formsOnBehalf: false });
    expect(productionSummary({ ...READY, contacts: { ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example', phone: '310' } } })).toEqual({
      legalName: 'Nocturne Pictures LLC',
      contactName: 'Sam Reyes',
      contactEmail: 'sam@nocturne.example',
      contactPhone: '310',
      formsOnBehalf: true,
    });
  });

  it('normalizes the body: trims, drops blanks and junk, and only ever grants authorization', () => {
    expect(normalizeProductionPatch(undefined)).toBeUndefined();
    expect(normalizeProductionPatch({ legalName: '  ', formsOnBehalf: false, junk: 1 })).toBeUndefined();
    expect(normalizeProductionPatch({ legalName: ' Acme ', contactEmail: 'a@b.c', formsOnBehalf: 'yes' })).toEqual({
      legalName: 'Acme',
      contactEmail: 'a@b.c',
    });
    expect(normalizeProductionPatch({ formsOnBehalf: true })).toEqual({ formsOnBehalf: true });
  });

  it('writes the patch over the profile and stamps a first authorization', () => {
    const now = new Date('2026-10-17T20:00:00Z');
    const next = applyProductionPatch(
      { ...EMPTY_ORDER_PROFILE, contacts: { ordering: { phone: '310' } } },
      { legalName: 'Acme', contactName: 'Sam', contactEmail: 'sam@acme.example', formsOnBehalf: true },
      { userId: 'u-1', now },
    );
    expect(next.company).toEqual({ legalName: 'Acme' });
    expect(next.contacts.ordering).toEqual({ name: 'Sam', email: 'sam@acme.example', phone: '310' });
    expect(next.authorization).toEqual({ formsOnBehalf: true, acceptedAt: now.toISOString(), acceptedByUserId: 'u-1' });
  });

  it('keeps an existing authorization stamp and everything the patch does not mention', () => {
    const next = applyProductionPatch(READY, { contactPhone: '310' }, { userId: 'u-2' });
    expect(next.authorization).toEqual(READY.authorization);
    expect(next.company).toEqual(READY.company);
    expect(next.contacts.ordering).toEqual({ name: 'Sam Reyes', email: 'sam@nocturne.example', phone: '310' });
    expect(next.defaults).toEqual(READY.defaults);
  });
});

describe('orderRequestReadiness', () => {
  const address = { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' };

  it('is ready with both dates and a full address; shoot details are optional', () => {
    expect(orderRequestReadiness({ rentalStart: '2026-09-07', rentalEnd: '2026-09-14', deliveryAddress: address })).toEqual({
      ready: true,
      missing: [],
    });
  });

  it('lists the dates and the location when both are missing', () => {
    expect(orderRequestReadiness({}).missing).toEqual(['Rental dates', 'Location']);
  });

  it('needs both dates, in order', () => {
    expect(orderRequestReadiness({ rentalStart: '2026-09-07', deliveryAddress: address }).missing).toEqual(['Rental dates']);
    expect(
      orderRequestReadiness({ rentalStart: '2026-09-14', rentalEnd: '2026-09-07', deliveryAddress: address }).missing,
    ).toEqual(['Rental dates']);
  });

  it('treats a partial address as no location, and notes alone do not stand in for it', () => {
    const dates = { rentalStart: '2026-09-07', rentalEnd: '2026-09-14' };
    expect(orderRequestReadiness({ ...dates, deliveryAddress: { line1: '4100 W Alameda Ave' } }).missing).toEqual(['Location']);
    expect(orderRequestReadiness({ ...dates, deliveryNotes: 'Stage 4 dock' }).missing).toEqual(['Location']);
  });
});

describe('defaultRentalWindow', () => {
  it('starts the next business day and runs the default number of days', () => {
    // Friday Sep 4 2026 → Monday Sep 7.
    const friday = new Date(2026, 8, 4, 15, 30);
    expect(defaultRentalWindow(READY, friday)).toEqual({
      rentalStart: '2026-09-07',
      rentalEnd: '2026-09-14',
    });
  });

  it('is null when the profile has no default window', () => {
    expect(defaultRentalWindow({ ...READY, defaults: {} })).toBeNull();
  });
});

describe('orderDefaults', () => {
  it('only carries a complete delivery address onto the order', () => {
    const wednesday = new Date(2026, 8, 2, 9, 0);
    expect(orderDefaults(READY, wednesday)).toEqual({
      rentalStart: '2026-09-03',
      rentalEnd: '2026-09-10',
      deliveryAddress: READY.defaults.deliveryAddress,
    });
    expect(
      orderDefaults({ ...READY, defaults: { deliveryAddress: { city: 'Burbank' }, deliveryNotes: 'dock' } }),
    ).toEqual({ deliveryNotes: 'dock' });
  });
});

describe('normalizeOrderProfile', () => {
  it('drops unknown keys, blanks, and bad types', () => {
    const p = normalizeOrderProfile({
      company: { legalName: '  Nocturne  ', entityType: 'partnership', ein: '12-3456789', address: { line1: '' } },
      contacts: { ordering: { name: 'Sam', email: '' } },
      defaults: { rentalWindowDays: '7', deliveryNotes: 42 },
      insurance: { glLimit: -5, additionalInsuredAvailable: 'yes', coiDocument: { name: 'coi.pdf' } },
      authorization: { formsOnBehalf: 'true' },
      extra: true,
    });
    expect(p).toEqual({
      company: { legalName: 'Nocturne' },
      contacts: { ordering: { name: 'Sam' } },
      defaults: { rentalWindowDays: 7 },
      insurance: {},
      authorization: { formsOnBehalf: false },
    });
  });

  it('round-trips a full profile', () => {
    expect(normalizeOrderProfile(READY)).toEqual(READY);
  });
});

describe('formatAddress', () => {
  it('reads as one line', () => {
    expect(formatAddress({ line1: '4100 W Alameda Ave', line2: 'Bldg 2', city: 'Burbank', state: 'CA', zip: '91505' })).toBe(
      '4100 W Alameda Ave Bldg 2, Burbank, CA 91505',
    );
    expect(formatAddress(undefined)).toBe('');
  });

  it('skips missing parts without stray separators', () => {
    expect(formatAddress({ city: 'Burbank' })).toBe('Burbank');
    expect(formatAddress({ line1: '1 Stage Rd', zip: '90028' })).toBe('1 Stage Rd, 90028');
    expect(formatAddress({})).toBe('');
  });
});

describe('normalizeAddress', () => {
  it('trims, drops blanks and unknown keys', () => {
    expect(normalizeAddress({ line1: ' 1 Stage Rd ', line2: '', city: 'LA', country: 'US', zip: 90028 })).toEqual({
      line1: '1 Stage Rd',
      city: 'LA',
    });
  });

  it('is undefined for nothing usable', () => {
    expect(normalizeAddress(undefined)).toBeUndefined();
    expect(normalizeAddress(null)).toBeUndefined();
    expect(normalizeAddress('4100 W Alameda')).toBeUndefined();
    expect(normalizeAddress(['4100 W Alameda'])).toBeUndefined();
    expect(normalizeAddress({ line1: '   ', zip: null })).toBeUndefined();
  });

  it('bounds every field at 500 characters', () => {
    expect(normalizeAddress({ line1: 'x'.repeat(600) })?.line1).toHaveLength(500);
  });
});

describe('isCompleteAddress', () => {
  it('needs line1, city, state and zip', () => {
    expect(isCompleteAddress(READY.defaults.deliveryAddress)).toBe(true);
    expect(isCompleteAddress({ ...READY.defaults.deliveryAddress, line2: undefined })).toBe(true);
    expect(isCompleteAddress({ line1: '1 Stage Rd', city: 'LA', state: 'CA' })).toBe(false);
    expect(isCompleteAddress({ line1: '', city: 'LA', state: 'CA', zip: '90028' })).toBe(false);
    expect(isCompleteAddress(undefined)).toBe(false);
  });
});

describe('normalizeOrderProfile edges', () => {
  it('is the empty profile for non-object input', () => {
    expect(normalizeOrderProfile(null)).toEqual(EMPTY_ORDER_PROFILE);
    expect(normalizeOrderProfile('x')).toEqual(EMPTY_ORDER_PROFILE);
    expect(normalizeOrderProfile([READY])).toEqual(EMPTY_ORDER_PROFILE);
  });

  it('keeps a known entity type, a complete coi pointer, and the authorization audit fields', () => {
    const p = normalizeOrderProfile({
      company: { legalName: 'N', entityType: 'llc' },
      insurance: {
        additionalInsuredAvailable: false,
        coiDocument: { storagePath: 'org/coi/x.pdf', name: 'coi.pdf', uploadedAt: '2026-09-01T00:00:00Z', extra: 1 },
        broker: { name: 'B', email: 'b@x.example', phone: '' },
      },
      authorization: { formsOnBehalf: true, acceptedAt: '2026-09-02T00:00:00Z', acceptedByUserId: 'u1' },
    });
    expect(p.company).toEqual({ legalName: 'N', entityType: 'llc' });
    expect(p.insurance).toEqual({
      additionalInsuredAvailable: false,
      coiDocument: { storagePath: 'org/coi/x.pdf', name: 'coi.pdf', uploadedAt: '2026-09-01T00:00:00Z' },
      broker: { name: 'B', email: 'b@x.example' },
    });
    expect(p.authorization).toEqual({ formsOnBehalf: true, acceptedAt: '2026-09-02T00:00:00Z', acceptedByUserId: 'u1' });
  });

  it('drops an incomplete coi pointer', () => {
    expect(normalizeOrderProfile({ insurance: { coiDocument: { storagePath: 'x', name: 'coi.pdf' } } }).insurance).toEqual({});
  });

  it('rounds numeric strings and refuses zero, negatives, NaN and Infinity', () => {
    expect(normalizeOrderProfile({ defaults: { rentalWindowDays: '7.6' } }).defaults).toEqual({ rentalWindowDays: 8 });
    expect(normalizeOrderProfile({ defaults: { rentalWindowDays: 0 } }).defaults).toEqual({});
    expect(normalizeOrderProfile({ insurance: { glLimit: -1, aggregateLimit: 'NaN', workersCompLimit: Infinity } }).insurance).toEqual({});
  });

  it('only ever records formsOnBehalf as a real true', () => {
    expect(normalizeOrderProfile({ authorization: { formsOnBehalf: 1 } }).authorization.formsOnBehalf).toBe(false);
    expect(normalizeOrderProfile({ authorization: { formsOnBehalf: 'true' } }).authorization.formsOnBehalf).toBe(false);
  });
});

describe('defaultRentalWindow weekends', () => {
  it('skips to Monday from Saturday and Sunday', () => {
    expect(defaultRentalWindow(READY, new Date(2026, 8, 5, 10))).toMatchObject({ rentalStart: '2026-09-07' });
    expect(defaultRentalWindow(READY, new Date(2026, 8, 6, 10))).toMatchObject({ rentalStart: '2026-09-07' });
  });

  it('runs a one-day window to the next calendar day, weekend or not', () => {
    expect(defaultRentalWindow({ ...READY, defaults: { rentalWindowDays: 1 } }, new Date(2026, 8, 3, 10))).toEqual({
      rentalStart: '2026-09-04',
      rentalEnd: '2026-09-05',
    });
  });
});

describe('AUTHORIZATION_SENTENCE', () => {
  it('is the exact copy the checkbox shows', () => {
    expect(AUTHORIZATION_SENTENCE).toBe(
      'Prop Haus may complete vendor forms and send vendor requests using the information above. I sign anything that needs a signature.',
    );
  });
});
