import { describe, expect, it } from 'vitest';
import type { InsuranceRoute } from '../insurance/route';
import {
  BOOKING_EVENTS,
  BOOKING_STAGES,
  CERTIFICATE_EVENT,
  HAPPY_PATH,
  availableEvents,
  holdPlan,
  nextStage,
  orderStatusFor,
  platformFeeCents,
  receiptFor,
  suggestedAmountCents,
  type BookingEventType,
  type BookingStage,
} from './machine';

describe('the booking machine', () => {
  it('walks a house from inquiry to pickup, one event per stage', () => {
    const events: BookingEventType[] = ['confirm', 'issue_coi', 'place_hold', 'capture'];
    const walked = events.reduce<BookingStage[]>(
      (path, event) => [...path, nextStage(path[path.length - 1]!, event, 'athos')!],
      ['inquiry_sent'],
    );
    expect(walked).toEqual(HAPPY_PATH);
  });

  it('refuses every event the table does not list for a stage, on every route', () => {
    const routes: InsuranceRoute[] = ['athos', 'own', 'on_file'];
    for (const route of routes) {
      const allowed: Record<BookingStage, BookingEventType[]> = {
        inquiry_sent: ['confirm', 'decline'],
        confirmed: [CERTIFICATE_EVENT[route]],
        coi_issued: ['place_hold'],
        hold_placed: ['capture', 'expire_hold'],
        captured: ['charge_extra'],
        declined: [],
      };
      for (const stage of BOOKING_STAGES) {
        expect(availableEvents(stage, route)).toEqual(allowed[stage]);
        for (const event of BOOKING_EVENTS) {
          expect(nextStage(stage, event, route) !== null).toBe(allowed[stage].includes(event));
        }
      }
    }
  });

  it('the certificate comes one way per route: the fallback insurer, the broker, or the file', () => {
    expect(nextStage('confirmed', 'issue_coi', 'athos')).toBe('coi_issued');
    expect(nextStage('confirmed', 'issue_coi', 'own')).toBeNull();
    expect(nextStage('confirmed', 'receive_coi', 'own')).toBe('coi_issued');
    expect(nextStage('confirmed', 'attach_coi', 'on_file')).toBe('coi_issued');
    expect(nextStage('confirmed', 'attach_coi', 'athos')).toBeNull();
  });

  it('a lapsed hold goes back to waiting for a hold; a declined house goes nowhere', () => {
    expect(nextStage('hold_placed', 'expire_hold', 'athos')).toBe('coi_issued');
    expect(nextStage('declined', 'confirm', 'athos')).toBeNull();
    expect(nextStage('captured', 'charge_extra', 'athos')).toBe('captured');
  });
});

describe('holdPlan', () => {
  it('places the hold now when pickup is inside a hold lifetime', () => {
    expect(holdPlan('2026-11-10', '2026-11-06')).toEqual({ when: 'now' });
    expect(holdPlan('2026-11-12', '2026-11-06')).toEqual({ when: 'now' });
    expect(holdPlan(undefined, '2026-11-06')).toEqual({ when: 'now' });
  });

  it('waits when a hold placed today would lapse before pickup', () => {
    expect(holdPlan('2026-12-01', '2026-11-06')).toEqual({ when: 'later', placeOn: '2026-11-25' });
  });
});

describe('orderStatusFor', () => {
  it.each<[BookingStage[], string]>([
    [[], 'placed'],
    [['inquiry_sent', 'inquiry_sent'], 'placed'],
    [['confirmed', 'inquiry_sent'], 'processing'],
    [['declined', 'inquiry_sent'], 'processing'],
    [['hold_placed', 'declined'], 'confirmed'],
    [['captured', 'coi_issued'], 'confirmed'],
    [['declined', 'declined'], 'cancelled'],
  ])('%j reads as %s', (stages, status) => {
    expect(orderStatusFor(stages)).toBe(status);
  });
});

describe('money', () => {
  it('takes the placeholder fee from the house total', () => {
    expect(platformFeeCents(27_000)).toBe(2_700);
    expect(platformFeeCents(1_005)).toBe(101);
  });

  it('suggests a total from listed prices, with a stand-in for unpriced lines', () => {
    expect(suggestedAmountCents([{ priceCents: 12_000 }, {}])).toBe(27_000);
  });

  it('prints one receipt across houses, extras included, and none before a capture', () => {
    expect(receiptFor([{ vendorId: 'omega', vendorName: 'Omega', extras: [] }])).toBeNull();

    const receipt = receiptFor([
      {
        vendorId: 'omega',
        vendorName: 'Omega',
        capture: { chargeId: 'c', transferId: 't', amountCents: 27_000, feeCents: 2_700, payoutCents: 24_300, capturedAt: 'x' },
        extras: [{ chargeId: 'e', kind: 'late_fee', amountCents: 5_000, chargedAt: 'x' }],
      },
      {
        vendorId: 'hpr',
        vendorName: 'HPR',
        capture: { chargeId: 'c2', transferId: 't2', amountCents: 10_000, feeCents: 1_000, payoutCents: 9_000, capturedAt: 'x' },
        extras: [],
      },
      { vendorId: 'ec', vendorName: 'EC', extras: [] },
    ])!;
    expect(receipt.lines.map((l) => [l.vendorName, l.label, l.amountCents])).toEqual([
      ['Omega', 'Rental', 27_000],
      ['Omega', 'Late fee', 5_000],
      ['HPR', 'Rental', 10_000],
    ]);
    expect(receipt).toMatchObject({ chargedCents: 42_000, feeCents: 3_700, payoutCents: 38_300 });
  });
});
