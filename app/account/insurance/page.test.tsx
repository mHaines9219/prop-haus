// /account/insurance is a permanent redirect onto the order profile.
import { describe, expect, it } from 'vitest';
import { RedirectSignal } from '@/test/mocks/next-navigation';
import InsurancePage from './page';

describe('InsurancePage', () => {
  it('permanently redirects to /account/profile', () => {
    expect(() => InsurancePage()).toThrow(RedirectSignal);
    expect(() => InsurancePage()).toThrow('/account/profile');
  });
});
