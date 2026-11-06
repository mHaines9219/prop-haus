import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  StatusToken,
  TONE_DOT,
  bookingStageSpec,
  checklistStatusSpec,
  crewStatusSpec,
  documentStatusSpec,
  itemStatusSpec,
  jobStatusSpec,
  messageStatusSpec,
  orderStatusSpec,
  projectStatusSpec,
} from './status-token';

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

  it('draws each tone from its status token, never a palette color', () => {
    for (const tone of ['pending', 'quoted', 'confirmed', 'unavailable'] as const) {
      const { container, unmount } = render(<StatusToken tone={tone} label={tone} />);
      expect(container.querySelector(`.${TONE_DOT[tone]}`)).not.toBeNull();
      expect(TONE_DOT[tone]).toBe(`bg-status-${tone}`);
      unmount();
    }
  });
});

describe('domain mappings', () => {
  it.each([
    ['active', 'quoted', 'ACTIVE'],
    ['pending', 'pending', 'PENDING'],
    ['done', 'confirmed', 'DONE'],
    ['garbage', 'pending', 'PENDING'],
  ])('projects.status %s → %s/%s', (status, tone, label) => {
    expect(projectStatusSpec(status)).toEqual({ tone, label });
  });

  it.each([
    ['active', 'quoted', 'ACTIVE'],
    ['pending', 'pending', 'PENDING'],
    ['done', 'confirmed', 'DONE'],
    ['garbage', 'pending', 'PENDING'],
  ])('orders.job_status %s → %s/%s', (status, tone, label) => {
    expect(jobStatusSpec(status)).toEqual({ tone, label });
  });

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

  it.each([
    ['filled', 'confirmed', 'FILLED'],
    ['awaiting_signature', 'quoted', 'SIGN NEEDED'],
    ['signed', 'confirmed', 'SIGNED'],
    ['manual', 'pending', 'MANUAL'],
    ['failed', 'unavailable', 'UNAVAILABLE'],
    ['skipped', 'pending', 'PENDING'],
  ])('order_documents.status %s → %s/%s', (status, tone, label) => {
    expect(documentStatusSpec(status)).toEqual({ tone, label });
  });

  it.each([
    ['complete', 'upload', 'confirmed', 'COMPLETE'],
    ['not_applicable', 'upload', 'pending', 'N/A'],
    ['needs_information', 'template', 'quoted', 'NEEDS INFO'],
    ['awaiting', 'external', 'pending', 'REQUESTED'],
    ['missing', 'template', 'quoted', 'TEMPLATE READY'],
    ['missing', 'external', 'pending', 'EXTERNAL'],
    ['missing', 'track', 'pending', 'AT CHECKOUT'],
    ['missing', 'upload', 'pending', 'UPLOAD'],
  ])('checklist %s via %s → %s/%s', (status, fulfillment, tone, label) => {
    expect(checklistStatusSpec(status, fulfillment)).toEqual({ tone, label });
  });

  it.each([
    ['sandbox', 'pending', 'NOT SENT'],
    ['sent', 'confirmed', 'SENT'],
    ['failed', 'unavailable', 'FAILED'],
    ['sending', 'pending', 'SENDING'],
  ])('outbound_messages.status %s → %s/%s', (status, tone, label) => {
    expect(messageStatusSpec(status)).toEqual({ tone, label });
  });

  it.each([
    ['inquiry', 'pending', 'INQUIRY OUT'],
    ['confirmed', 'quoted', 'CONFIRMED'],
    ['coi_issued', 'quoted', 'COI ISSUED'],
    ['hold_placed', 'quoted', 'HOLD PLACED'],
    ['captured', 'confirmed', 'PICKED UP'],
    ['declined', 'unavailable', 'DECLINED'],
  ])('order_bookings.stage %s → %s/%s', (stage, tone, label) => {
    expect(bookingStageSpec(stage)).toEqual({ tone, label });
  });
});
