import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, safeExternalUrl } from './safe-url';

/**
 * A certificate URL is rendered as an href. This is the allow-list that keeps
 * `javascript:` and its spellings out of it, so every bypass shape is pinned.
 */

describe('isSafeExternalUrl', () => {
  it.each(['https://broker.example/coi.pdf', 'http://broker.example/coi.pdf', 'HTTPS://BROKER.EXAMPLE/x'])(
    'allows %s',
    (url) => {
      expect(isSafeExternalUrl(url)).toBe(true);
    },
  );

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    'ftp://files.example/coi.pdf',
    'mailto:broker@example.com',
    'file:///etc/passwd',
  ])('refuses %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });

  it.each(['/coi.pdf', '//evil.example/x', 'coi.pdf', 'https://', '   ', 'not a url'])(
    'refuses relative, protocol-relative and unparseable values (%j)',
    (url) => {
      expect(isSafeExternalUrl(url)).toBe(false);
    },
  );

  it('refuses empty, null and undefined', () => {
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
  });
});

describe('safeExternalUrl', () => {
  it('returns the value untouched when it is safe', () => {
    expect(safeExternalUrl('https://broker.example/coi.pdf')).toBe('https://broker.example/coi.pdf');
  });

  it('returns undefined otherwise, so href={...} renders nothing', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeExternalUrl(null)).toBeUndefined();
    expect(safeExternalUrl('')).toBeUndefined();
  });
});
