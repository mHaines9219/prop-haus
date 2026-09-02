import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor } from './contractor-card';
import { CrewDirectory } from './crew-directory';

// The /crew roster: role chips filter client-side, mirror to ?role=, and the
// empty states distinguish "nobody at all" from "nobody in this role".

vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants']);
  const strip = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k]) => !MOTION.has(k)));
  const cache = new Map<string, React.FC<any>>();
  return {
    motion: new Proxy({}, {
      get: (_t, tag) => {
        const k = String(tag);
        if (!cache.has(k)) cache.set(k, ({ children, ...p }: any) => React.createElement(k, strip(p), children));
        return cache.get(k);
      },
    }),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
  };
});

const person = (id: string, name: string, skills: string[]): Contractor => ({
  id,
  name,
  photo: null,
  skills,
  city: 'LA',
  rate_low: null,
  rate_high: null,
  bio: null,
  category: 'crew',
});

const roster = [
  person('a', 'Ada', ['set-hands']),
  person('b', 'Bo', ['delivery']),
  person('c', 'Cy', ['load-in', 'delivery']),
];

// Chip text is "<label><span>count</span>", which the accessible-name algorithm
// joins without a space, so match the count with an optional gap.
const chip = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name.replace(/ (\d+)$/, '\\s?$1')}$`) });
// With photo: null the LightWell plate repeats the name, so presence is a count check.
const present = (name: string) => screen.queryAllByText(name).length > 0;
const cards = () => screen.getAllByRole('button', { name: 'Request crew' });

describe('CrewDirectory', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/crew');
  });

  it('lists everyone with per-role counts and the running total', () => {
    render(<CrewDirectory contractors={roster} />);
    expect(screen.getByRole('group', { name: 'Filter crew by role' })).toBeInTheDocument();
    expect(chip('All crew 3')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Production assistants 2')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Delivery 2')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('3', { selector: '.font-bold' })).toBeInTheDocument();
    expect(screen.getByText(/contractors available/)).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });

  it('filters by role, names it in the count, and mirrors it to the URL', async () => {
    render(<CrewDirectory contractors={roster} />);
    await userEvent.click(chip('Delivery 2'));
    expect(chip('Delivery 2')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('All crew 3')).toHaveAttribute('aria-pressed', 'false');
    expect(present('Bo')).toBe(true);
    expect(present('Cy')).toBe(true);
    expect(present('Ada')).toBe(false);
    expect(screen.getByText('2', { selector: '.font-bold' }).closest('p')).toHaveTextContent('2 contractors, Delivery');
    expect(window.location.search).toBe('?role=delivery');

    await userEvent.click(chip('Delivery 2'));
    expect(cards()).toHaveLength(3);
    expect(window.location.search).toBe('');
  });

  it('uses the singular noun for one match', async () => {
    render(<CrewDirectory contractors={roster.slice(0, 2)} />);
    await userEvent.click(chip('Production assistants 1'));
    expect(screen.getByText('contractor', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/contractors/)).toBeNull();
  });

  it('starts on the role passed in', () => {
    render(<CrewDirectory contractors={roster} initialRole="production-assistant" />);
    expect(chip('Production assistants 2')).toHaveAttribute('aria-pressed', 'true');
    expect(cards()).toHaveLength(2);
  });

  it('shows the role-specific empty state with a way back', async () => {
    render(<CrewDirectory contractors={[person('a', 'Ada', ['set-hands'])]} />);
    await userEvent.click(chip('Delivery 0'));
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('No delivery available right now.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all crew' }));
    expect(present('Ada')).toBe(true);
    expect(chip('All crew 1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the roster-wide empty state without a reset button', () => {
    render(<CrewDirectory contractors={[]} />);
    expect(screen.getByText('No one available right now — check back soon.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all crew' })).toBeNull();
    expect(chip('All crew 0')).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores skills that map to no role when counting', () => {
    render(<CrewDirectory contractors={[person('z', 'Zed', ['rigging'])]} />);
    expect(chip('All crew 1')).toBeInTheDocument();
    expect(chip('Production assistants 0')).toBeInTheDocument();
    expect(chip('Delivery 0')).toBeInTheDocument();
    expect(cards()).toHaveLength(1);
  });
});
