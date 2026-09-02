import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NullProvider, paymentProvider } from './provider';

/** The stub rails: every call succeeds, logs, and returns a token that names its input. */

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('NullProvider', () => {
  const p = new NullProvider();

  it('authorizes with a token derived from the order id', async () => {
    await expect(p.authorize({ orderId: 'o1', amountCents: 5000, currency: 'usd' })).resolves.toEqual({
      authToken: 'null_auth_o1',
    });
    expect(console.log).toHaveBeenCalledWith('[payments/null] authorize', {
      orderId: 'o1',
      amountCents: 5000,
      currency: 'usd',
    });
  });

  it('captures a hold into a charge id', async () => {
    await expect(p.capture({ authToken: 'null_auth_o1' })).resolves.toEqual({ chargeId: 'null_charge_null_auth_o1' });
    expect(console.log).toHaveBeenCalledWith('[payments/null] capture', { authToken: 'null_auth_o1' });
  });

  it('refunds fully or partially with the same shape', async () => {
    await expect(p.refund({ chargeId: 'c1' })).resolves.toEqual({ refundId: 'null_refund_c1' });
    await expect(p.refund({ chargeId: 'c1', amountCents: 100 })).resolves.toEqual({ refundId: 'null_refund_c1' });
    expect(console.log).toHaveBeenLastCalledWith('[payments/null] refund', { chargeId: 'c1', amountCents: 100 });
  });

  it('chains authorize → capture → refund', async () => {
    const { authToken } = await p.authorize({ orderId: 'o2', amountCents: 1, currency: 'usd' });
    const { chargeId } = await p.capture({ authToken });
    const { refundId } = await p.refund({ chargeId });
    expect(refundId).toBe('null_refund_null_charge_null_auth_o2');
  });
});

describe('paymentProvider', () => {
  it('is the null provider until real rails are chosen', () => {
    expect(paymentProvider).toBeInstanceOf(NullProvider);
  });
});
