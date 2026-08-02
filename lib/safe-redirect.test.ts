import { describe, expect, it } from 'vitest';
import { DEFAULT_NEXT, safeNext } from './safe-redirect';

/**
 * An open redirect on a sign-in route is worse than an open redirect anywhere
 * else: the user has just been authenticated, so the page they land on has
 * every reason to look trustworthy. These are the cases a `startsWith('/')`
 * check alone gets wrong.
 */
describe('safeNext', () => {
  it('keeps ordinary in-site paths', () => {
    expect(safeNext('/projects')).toBe('/projects');
    expect(safeNext('/projects/abc123')).toBe('/projects/abc123');
    expect(safeNext('/search?q=70s+apartment')).toBe('/search?q=70s+apartment');
  });

  it('rejects absolute URLs', () => {
    expect(safeNext('https://evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('http://evil.example/path')).toBe(DEFAULT_NEXT);
  });

  it('rejects protocol-relative URLs, which start with a slash', () => {
    // The case a naive startsWith('/') check lets straight through.
    expect(safeNext('//evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('//evil.example/looks/like/a/path')).toBe(DEFAULT_NEXT);
  });

  it('rejects backslash variants that browsers may normalise', () => {
    expect(safeNext('/\\evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('\\\\evil.example')).toBe(DEFAULT_NEXT);
  });

  it('falls back on empty and missing values', () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNext('')).toBe(DEFAULT_NEXT);
  });

  it('honours an explicit fallback', () => {
    expect(safeNext('https://evil.example', '/')).toBe('/');
  });
});
