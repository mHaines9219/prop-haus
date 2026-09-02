import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OutboundLink } from './outbound-link';

// The attributed vendor link: a real href in a new tab, plus a best-effort
// sendBeacon that must never block the navigation.

function withBeacon(impl: (url: string, data: Blob) => boolean) {
  const spy = vi.fn(impl);
  Object.defineProperty(navigator, 'sendBeacon', { value: spy, configurable: true, writable: true });
  return spy;
}

const renderLink = () =>
  render(
    <OutboundLink href="https://omegacinemaprops.com/item/1" itemId="omega-1" source="omega" surface="item_detail" className="x">
      View at Omega
    </OutboundLink>,
  );

describe('OutboundLink', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  it('opens the vendor URL in a new tab without leaking the opener', () => {
    renderLink();
    const a = screen.getByRole('link', { name: 'View at Omega' });
    expect(a).toHaveAttribute('href', 'https://omegacinemaprops.com/item/1');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toMatch(/noreferrer|noopener/);
    expect(a).toHaveClass('x');
  });

  it('beacons the click with item, source and surface as JSON', async () => {
    const spy = withBeacon(() => true);
    renderLink();
    const notPrevented = fireEvent.click(screen.getByRole('link'));
    expect(notPrevented).toBe(true);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, blob] = spy.mock.calls[0];
    expect(url).toBe('/api/events/outbound-click');
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({ itemId: 'omega-1', source: 'omega', surface: 'item_detail' });
  });

  it('still navigates when sendBeacon is unavailable', () => {
    renderLink();
    expect(navigator.sendBeacon).toBeUndefined();
    expect(fireEvent.click(screen.getByRole('link'))).toBe(true);
  });

  it('still navigates when sendBeacon throws or refuses the payload', () => {
    withBeacon(() => {
      throw new Error('queue full');
    });
    renderLink();
    expect(fireEvent.click(screen.getByRole('link'))).toBe(true);

    withBeacon(() => false);
    expect(fireEvent.click(screen.getByRole('link'))).toBe(true);
  });
});
