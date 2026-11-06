import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FREE_VIEW } from '@/lib/plan-view';
import { planView, withPlan } from '@/test/helpers/plan';
import { VendorCredit, VendorLine, VendorName, VendorOutbound } from './vendor-credit';

const loading = { ...FREE_VIEW, status: 'loading' as const };

function outbound() {
  return <VendorOutbound name="Newel" href="https://newel.example/item/9" itemId="item-9" source="heritage" className="btn" />;
}

afterEach(() => vi.unstubAllGlobals());

describe('vendor credit on Browse (free)', () => {
  it('withholds the house everywhere and points to the rate card instead of the vendor', () => {
    render(
      withPlan(
        <>
          <VendorLine name="Newel" />
          <span data-testid="name">
            <VendorName name="Newel" />
          </span>
          <VendorCredit name="Newel" />
          {outbound()}
        </>,
        'free',
      ),
    );
    expect(screen.queryByText(/Newel/)).toBeNull();
    expect(screen.getByText('Prop house withheld')).toBeInTheDocument();
    expect(screen.getByTestId('name')).toHaveTextContent('Withheld');
    expect(screen.getByText('Prop house withheld on the Browse plan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See rates' })).toHaveAttribute('href', '/pricing');
  });

  it('withholds when no plan provider is mounted, rather than revealing', () => {
    render(<VendorCredit name="Newel" />);
    expect(screen.getByText('Prop house withheld on the Browse plan')).toBeInTheDocument();
  });

  it('a signed-in admin viewing as Browse sees Browse', () => {
    render(withPlan(<VendorCredit name="Newel" />, planView('free', { actualPlan: 'pro', isAdmin: true })));
    expect(screen.getByText('Prop house withheld on the Browse plan')).toBeInTheDocument();
  });
});

describe.each(['directory', 'pro'] as const)('vendor credit on %s', (plan) => {
  it('names the house and links out to it, firing the demand beacon', async () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon });
    render(
      withPlan(
        <>
          <VendorLine name="Newel" className="line" />
          <span data-testid="name">
            <VendorName name="Newel" />
          </span>
          <VendorCredit name="Newel" />
          {outbound()}
        </>,
        plan,
      ),
    );
    expect(screen.getByText('Newel', { selector: 'p.line' })).toBeInTheDocument();
    expect(screen.getByTestId('name')).toHaveTextContent('Newel');
    expect(screen.getByText('Courtesy of Newel')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'View on Newel' });
    expect(link).toHaveAttribute('href', 'https://newel.example/item/9');
    expect(link).toHaveAttribute('target', '_blank');
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(sendBeacon).toHaveBeenCalledWith('/api/events/outbound-click', expect.any(Blob));
  });
});

describe('vendor credit while the plan is loading', () => {
  it('prints neither answer, so nothing flashes and then flips', () => {
    const { container } = render(
      withPlan(
        <>
          <VendorLine name="Newel" />
          <VendorName name="Newel" />
          <VendorCredit name="Newel" />
          {outbound()}
        </>,
        loading,
      ),
    );
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('link')).toBeNull();
    const slots = container.querySelectorAll('p[aria-hidden]');
    expect(slots).toHaveLength(2);
  });
});
