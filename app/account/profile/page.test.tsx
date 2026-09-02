// /account/profile: session gate, and the loaded profile + readiness handed to the form.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import { READY_PROFILE } from '@/test/fixtures/orders';
import { EMPTY_ORDER_PROFILE, type OrderProfile, type OrderReadiness } from '@/lib/order-profile';
import OrderProfilePage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/order-profile-store', () => ({ getOrderProfile: vi.fn() }));
vi.mock('./order-profile-form', () => ({
  OrderProfileForm: (props: { initialProfile: OrderProfile; initialReadiness: OrderReadiness }) => (
    <form data-testid="order-profile-form" data-props={JSON.stringify(props)} />
  ),
}));

const store = vi.mocked(await import('@/lib/order-profile-store'));

function formProps(): { initialProfile: OrderProfile; initialReadiness: OrderReadiness } {
  return JSON.parse(screen.getByTestId('order-profile-form').dataset.props!);
}

beforeEach(() => {
  store.getOrderProfile.mockReset();
});

describe('OrderProfilePage', () => {
  it('redirects a signed-out visitor to /login with next=/account/profile', async () => {
    signOut();
    await expect(OrderProfilePage()).rejects.toThrow('/login?next=%2Faccount%2Fprofile');
    expect(store.getOrderProfile).not.toHaveBeenCalled();
  });

  it('loads the org profile and hands a ready profile to the form', async () => {
    signIn();
    store.getOrderProfile.mockResolvedValue(READY_PROFILE);
    render(await OrderProfilePage());

    expect(store.getOrderProfile).toHaveBeenCalledWith(ORG_ID);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order profile');
    expect(screen.getByText(/you sign\./)).toBeInTheDocument();
    const props = formProps();
    expect(props.initialProfile).toEqual(READY_PROFILE);
    expect(props.initialReadiness).toEqual({ ready: true, missing: [] });
  });

  it('computes what is missing for an empty profile', async () => {
    signIn();
    store.getOrderProfile.mockResolvedValue(EMPTY_ORDER_PROFILE);
    render(await OrderProfilePage());
    expect(formProps().initialReadiness).toEqual({
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

  it('passes the COI on file through untouched, and readiness ignores it', async () => {
    signIn();
    const withCoi: OrderProfile = {
      ...READY_PROFILE,
      insurance: {
        carrier: 'Hiscox',
        glLimit: 1_000_000,
        coiDocument: { storagePath: 'org/coi.pdf', name: 'coi.pdf', uploadedAt: '2026-09-01T00:00:00Z' },
      },
    };
    store.getOrderProfile.mockResolvedValue(withCoi);
    render(await OrderProfilePage());
    const props = formProps();
    expect(props.initialProfile.insurance.coiDocument?.name).toBe('coi.pdf');
    expect(props.initialReadiness.ready).toBe(true);
  });
});
