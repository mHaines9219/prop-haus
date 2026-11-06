/**
 * Payment rails behind one interface, shaped by the booking flow: the card is
 * saved at checkout with no charge, each house gets its own hold once it
 * confirms, and the holds are captured and split at pickup.
 *
 * The only implementation today is the sandbox. A Stripe adapter maps onto it
 * one to one: saveCard is a SetupIntent, placeHold a manual-capture
 * PaymentIntent, capture a capture with a Connect transfer and application
 * fee, chargeExtra an off-session charge on the saved card.
 */

/** How long a card authorization lasts before it lapses. Stripe's is about 7 days. */
export const HOLD_LIFETIME_DAYS = 7;

export type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  setupIntentId: string;
  savedAt: string;
};

export type Hold = {
  id: string;
  amountCents: number;
  placedAt: string;
  expiresAt: string;
};

export type Capture = {
  chargeId: string;
  /** The Connect transfer to the house's own account. */
  transferId: string;
  amountCents: number;
  feeCents: number;
  payoutCents: number;
  capturedAt: string;
};

export const EXTRA_KINDS = ['damage', 'loss', 'late_fee'] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];

export type ExtraCharge = {
  chargeId: string;
  kind: ExtraKind;
  amountCents: number;
  note?: string;
  chargedAt: string;
};

export interface PaymentProvider {
  /** Save the card for later. No charge, no hold. */
  saveCard(params: { orgId: string; orderId: string }): Promise<SavedCard>;
  /** Authorize one house's total on the saved card. */
  placeHold(params: { card: SavedCard; orderId: string; vendorId: string; amountCents: number }): Promise<Hold>;
  /** Capture a hold, pay the house, keep the platform fee. */
  capture(params: { hold: Hold; vendorId: string; feeCents: number }): Promise<Capture>;
  /** Charge the saved card after pickup: damage, loss, a late fee. */
  chargeExtra(params: {
    card: SavedCard;
    vendorId: string;
    kind: ExtraKind;
    amountCents: number;
    note?: string;
  }): Promise<ExtraCharge>;
}

/**
 * The sandbox rails. Every call succeeds and moves no money; ids are prefixed
 * `sbx_` so a sandbox record can never be mistaken for a live one.
 */
export class SandboxPayments implements PaymentProvider {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async saveCard({ orderId }: { orgId: string; orderId: string }): Promise<SavedCard> {
    return {
      id: `sbx_pm_${orderId}`,
      brand: 'Visa',
      last4: '4242',
      setupIntentId: `sbx_seti_${orderId}`,
      savedAt: this.now().toISOString(),
    };
  }

  async placeHold(params: { card: SavedCard; orderId: string; vendorId: string; amountCents: number }): Promise<Hold> {
    const placed = this.now();
    const expires = new Date(placed.getTime() + HOLD_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
    return {
      id: `sbx_hold_${params.orderId}_${params.vendorId}_${placed.getTime()}`,
      amountCents: params.amountCents,
      placedAt: placed.toISOString(),
      expiresAt: expires.toISOString(),
    };
  }

  async capture({ hold, vendorId, feeCents }: { hold: Hold; vendorId: string; feeCents: number }): Promise<Capture> {
    return {
      chargeId: hold.id.replace('sbx_hold_', 'sbx_ch_'),
      transferId: `sbx_tr_${vendorId}_${this.now().getTime()}`,
      amountCents: hold.amountCents,
      feeCents,
      payoutCents: hold.amountCents - feeCents,
      capturedAt: this.now().toISOString(),
    };
  }

  async chargeExtra(params: {
    card: SavedCard;
    vendorId: string;
    kind: ExtraKind;
    amountCents: number;
    note?: string;
  }): Promise<ExtraCharge> {
    const at = this.now();
    return {
      chargeId: `sbx_ch_extra_${params.vendorId}_${at.getTime()}`,
      kind: params.kind,
      amountCents: params.amountCents,
      ...(params.note ? { note: params.note } : {}),
      chargedAt: at.toISOString(),
    };
  }
}

export const paymentProvider: PaymentProvider = new SandboxPayments();
