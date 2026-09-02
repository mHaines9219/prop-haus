import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { siteBaseUrl, spacelabBaseUrl, spacelabRoomUrl } from './config';

/**
 * Every URL that crosses into Spacelab is absolute and built from env that is
 * usually unset, so the fallbacks and the trailing-slash hygiene are the
 * whole story here.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', undefined);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('spacelabBaseUrl', () => {
  it('is null until Spacelab is deployed', () => {
    expect(spacelabBaseUrl()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', '   ');
    expect(spacelabBaseUrl()).toBeNull();
  });

  it('trims whitespace and trailing slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', '  https://spacelab.app///  ');
    expect(spacelabBaseUrl()).toBe('https://spacelab.app');
  });
});

describe('siteBaseUrl', () => {
  it('falls back to local dev with nothing set', () => {
    expect(siteBaseUrl()).toBe('http://localhost:3000');
  });

  it('uses the Vercel host over https when no explicit site url exists', () => {
    vi.stubEnv('VERCEL_URL', 'prop-haus-abc.vercel.app/');
    expect(siteBaseUrl()).toBe('https://prop-haus-abc.vercel.app');
  });

  it('prefers the explicit site url and strips its trailing slash', () => {
    vi.stubEnv('VERCEL_URL', 'prop-haus-abc.vercel.app');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://prophaus.com/ ');
    expect(siteBaseUrl()).toBe('https://prophaus.com');
  });

  it('ignores a blank explicit url', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '   ');
    expect(siteBaseUrl()).toBe('http://localhost:3000');
  });
});

describe('spacelabRoomUrl', () => {
  it('is null without a Spacelab deployment', () => {
    expect(spacelabRoomUrl('scene-1', 'tok')).toBeNull();
  });

  it('deep-links the room file and its catalog, both token-bearing and absolute', () => {
    vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', 'https://spacelab.app/');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://prophaus.com');
    const url = spacelabRoomUrl('scene-1', 'a/b c');
    expect(url!.startsWith('https://spacelab.app/?room=')).toBe(true);
    const params = new URL(url!).searchParams;
    expect(params.get('room')).toBe('https://prophaus.com/api/spacelab/scenes/scene-1?token=a%2Fb%20c');
    expect(params.get('catalog')).toBe('https://prophaus.com/api/spacelab/catalog?scene=scene-1&token=a%2Fb%20c');
  });
});
