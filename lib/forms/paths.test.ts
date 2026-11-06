import { describe, expect, it } from 'vitest';
import { signPagePath } from './paths';

describe('signPagePath', () => {
  it('points at the order’s sign page for one document', () => {
    expect(signPagePath('order-1', 'doc-9')).toBe('/orders/order-1/sign/doc-9');
  });
});
