import { describe, expect, it } from 'vitest';
import {
  EMPTY_ORDER_PROFILE,
  defaultRentalWindow,
  formatAddress,
  normalizeOrderProfile,
  orderDefaults,
  orderReadiness,
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
        'Delivery address',
        'Authorization to complete forms',
      ],
    });
  });

  it('is ready without any insurance on file', () => {
    expect(orderReadiness(READY)).toEqual({ ready: true, missing: [] });
  });

  it('accepts a default window plus delivery notes in place of an address', () => {
    const p: OrderProfile = {
      ...READY,
      defaults: { rentalWindowDays: 3, deliveryNotes: 'Stage 4 loading dock, ask for Sam' },
    };
    expect(orderReadiness(p).ready).toBe(true);
    expect(orderReadiness({ ...p, defaults: { deliveryNotes: 'dock' } }).missing).toEqual([
      'Delivery address',
    ]);
  });

  it('treats a partial address as missing', () => {
    const p: OrderProfile = { ...READY, defaults: { deliveryAddress: { line1: '4100 W Alameda Ave' } } };
    expect(orderReadiness(p).missing).toEqual(['Delivery address']);
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
});
