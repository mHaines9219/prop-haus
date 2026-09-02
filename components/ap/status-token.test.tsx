import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusToken, crewStatusSpec, itemStatusSpec, orderStatusSpec } from './status-token';

/**
 * One chip for every status surface. The mappings are the contract: each
 * domain vocabulary must land on one of the four tones, and anything unknown
 * must read as pending rather than crash or invent a fifth color.
 */

describe('StatusToken', () => {
  it('renders the label in a mono uppercase pill with the tone dot', () => {
    const { container } = render(<StatusToken tone="confirmed" label="Confirmed" />);
    expect(screen.getByText('Confirmed')).toHaveClass('font-mono', 'uppercase');
    expect(container.querySelector('.bg-status-confirmed')).not.toBeNull();
  });

  it('passes className through to the pill', () => {
    const { container } = render(<StatusToken tone="pending" label="x" className="ml-2" />);
    expect(container.firstElementChild).toHaveClass('ml-2', 'border');
  });
});

describe('domain mappings', () => {
  it.each([
    ['pending', 'pending', 'PENDING'],
    ['quoted', 'quoted', 'QUOTED'],
    ['confirmed', 'confirmed', 'CONFIRMED'],
    ['unavailable', 'unavailable', 'UNAVAILABLE'],
    ['garbage', 'pending', 'PENDING'],
    ['', 'pending', 'PENDING'],
  ])('order_items.status %s → %s/%s', (status, tone, label) => {
    expect(itemStatusSpec(status)).toEqual({ tone, label });
  });

  it.each([
    ['placed', 'pending', 'PLACED'],
    ['processing', 'pending', 'PROCESSING'],
    ['confirmed', 'confirmed', 'CONFIRMED'],
    ['cancelled', 'unavailable', 'CANCELLED'],
    ['unknown', 'pending', 'PLACED'],
  ])('orders.status %s → %s/%s', (status, tone, label) => {
    expect(orderStatusSpec(status)).toEqual({ tone, label });
  });

  it.each([
    ['requested', 'pending', 'REQUESTED'],
    ['confirmed', 'confirmed', 'CONFIRMED'],
    ['declined', 'unavailable', 'DECLINED'],
    ['??', 'pending', 'REQUESTED'],
  ])('crew_requests.status %s → %s/%s', (status, tone, label) => {
    expect(crewStatusSpec(status)).toEqual({ tone, label });
  });
});
