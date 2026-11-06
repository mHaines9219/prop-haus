import { describe, expect, it } from 'vitest';
import { HOLD_LIFETIME_DAYS, SandboxPayments } from './provider';

/** The sandbox rails: every call succeeds, moves no money, and is marked as sandbox. */

const NOW = new Date('2026-11-06T18:00:00.000Z');
const p = new SandboxPayments(() => NOW);

describe('SandboxPayments', () => {
  it('saves a test card without charging or holding anything', async () => {
    const card = await p.saveCard({ orgId: 'org', orderId: 'o1' });
    expect(card).toEqual({
      id: 'sbx_pm_o1',
      brand: 'Visa',
      last4: '4242',
      setupIntentId: 'sbx_seti_o1',
      savedAt: NOW.toISOString(),
    });
  });

  it('places a hold that lapses a hold-lifetime later', async () => {
    const card = await p.saveCard({ orgId: 'org', orderId: 'o1' });
    const hold = await p.placeHold({ card, orderId: 'o1', vendorId: 'omega', amountCents: 27_000 });
    expect(hold.amountCents).toBe(27_000);
    expect(hold.id).toMatch(/^sbx_hold_o1_omega_/);
    const days = (Date.parse(hold.expiresAt) - Date.parse(hold.placedAt)) / 86_400_000;
    expect(days).toBe(HOLD_LIFETIME_DAYS);
  });

  it('captures a hold and splits it between the house and the fee', async () => {
    const card = await p.saveCard({ orgId: 'org', orderId: 'o1' });
    const hold = await p.placeHold({ card, orderId: 'o1', vendorId: 'omega', amountCents: 27_000 });
    const capture = await p.capture({ hold, vendorId: 'omega', feeCents: 2_700 });
    expect(capture).toMatchObject({ amountCents: 27_000, feeCents: 2_700, payoutCents: 24_300 });
    expect(capture.chargeId).toMatch(/^sbx_ch_/);
    expect(capture.transferId).toMatch(/^sbx_tr_omega_/);
  });

  it('charges an extra on the saved card, keeping the note only when there is one', async () => {
    const card = await p.saveCard({ orgId: 'org', orderId: 'o1' });
    const late = await p.chargeExtra({ card, vendorId: 'omega', kind: 'late_fee', amountCents: 5_000 });
    expect(late).toMatchObject({ kind: 'late_fee', amountCents: 5_000 });
    expect(late).not.toHaveProperty('note');
    const damage = await p.chargeExtra({ card, vendorId: 'omega', kind: 'damage', amountCents: 9_000, note: 'Chipped veneer' });
    expect(damage.note).toBe('Chipped veneer');
  });
});
