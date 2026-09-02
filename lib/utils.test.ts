import { describe, expect, it } from 'vitest';
import { cn } from './utils';

/** Every component builds class strings through cn; conflict resolution is the part worth pinning. */

describe('cn', () => {
  it('joins plain strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy and conditional values', () => {
    expect(cn('a', false, null, undefined, 0, '', { b: true, c: false }, ['d', ['e']])).toBe('a b d e');
  });

  it('lets the later tailwind utility win a conflict', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('keeps non-conflicting utilities', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
  });

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('');
  });
});
