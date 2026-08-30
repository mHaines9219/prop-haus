export interface PaymentProvider {
  /** Authorize a payment hold. Returns an opaque auth token. */
  authorize(params: { orderId: string; amountCents: number; currency: string }): Promise<{ authToken: string }>;
  /** Capture a previously authorized hold. */
  capture(params: { authToken: string }): Promise<{ chargeId: string }>;
  /** Refund a captured charge, fully or partially. */
  refund(params: { chargeId: string; amountCents?: number }): Promise<{ refundId: string }>;
}

/**
 * No-op provider — logs and succeeds on every operation.
 * Swap for a real Stripe/etc. adapter once payment rails are chosen.
 */
export class NullProvider implements PaymentProvider {
  async authorize(params: { orderId: string; amountCents: number; currency: string }) {
    console.log('[payments/null] authorize', params);
    return { authToken: `null_auth_${params.orderId}` };
  }

  async capture(params: { authToken: string }) {
    console.log('[payments/null] capture', params);
    return { chargeId: `null_charge_${params.authToken}` };
  }

  async refund(params: { chargeId: string; amountCents?: number }) {
    console.log('[payments/null] refund', params);
    return { refundId: `null_refund_${params.chargeId}` };
  }
}

export const paymentProvider: PaymentProvider = new NullProvider();
