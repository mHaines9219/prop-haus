import { describe, expect, it } from 'vitest';
import { catalogEntryFor } from './catalog';
import { decodeAssetPath, encodeAssetPath, modelRouteUrl, storagePathFor } from './storage';
import type { SpacelabModel } from './models';

const model = (over: Partial<SpacelabModel> = {}): SpacelabModel => ({
  assetId: 'prophaus:ec:1042',
  source: 'ec',
  sourceId: '1042',
  title: 'Chesterfield Sofa, Oxblood',
  category: 'seating',
  spacelabCategory: 'seating',
  tags: ['seating', 'leather'],
  dims: { w: 2.1, h: 0.78, d: 0.9 },
  dimsSource: 'vendor',
  imageUrl: 'https://ecprops.com/img/1042.jpg',
  status: 'ready',
  glbUrl: 'https://cdn.example.com/prophaus/ec/1042.glb',
  anchor: 'floor',
  ...over,
});

describe('catalogEntryFor', () => {
  it('emits the fields Spacelab’s CatalogEntry requires', () => {
    const entry = catalogEntryFor(model());

    expect(entry.asset_id).toBe('prophaus:ec:1042');
    expect(entry.title).toBe('Chesterfield Sofa, Oxblood');
    expect(entry.category).toBe('seating');
    expect(entry.tags).toEqual(['seating', 'leather']);
    expect(entry.dims_m).toEqual({ w: 2.1, h: 0.78, d: 0.9 });
    // Absolute, because Spacelab loads it from a different origin.
    expect(entry.blob).toBe('https://cdn.example.com/prophaus/ec/1042.glb');
  });

  it('credits the vendor, which is the whole posture with the houses', () => {
    const entry = catalogEntryFor(model());
    expect(entry.source).toBe('EC Props');
    expect(entry.attribution).toContain('EC Props');
    // Generated from a photo, never measured or hand-authored.
    expect(entry.verified).toBe(false);
  });

  it('carries the wall anchor for wall-hung categories', () => {
    expect(catalogEntryFor(model({ anchor: 'wall' })).anchor).toBe('wall');
    expect(catalogEntryFor(model()).anchor).toBe('floor');
  });
});

describe('storagePathFor', () => {
  it('lays models out by vendor, with no colons in the object key', () => {
    expect(storagePathFor('prophaus:ec:1042')).toBe('prophaus/ec/1042.glb');
  });

  it('flattens a source id that would otherwise nest or escape the prefix', () => {
    const path = storagePathFor('prophaus:hpr:chairs%2Fwing%20back');
    expect(path.startsWith('prophaus/hpr/')).toBe(true);
    expect(path.endsWith('.glb')).toBe(true);
    // One object per asset: no stray directory levels from the vendor's id.
    expect(path.split('/')).toHaveLength(3);
  });

  it('still produces a usable key for an id it cannot parse', () => {
    expect(storagePathFor('couch-medium')).toBe('couch-medium.glb');
  });
});

describe('modelRouteUrl', () => {
  it('addresses a model with a path segment carrying no reserved characters', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://prophaus.test';
    const url = modelRouteUrl('prophaus:hpr:chairs%2Fwing back');
    expect(url.startsWith('https://prophaus.test/api/spacelab/models/')).toBe(true);
    const segment = url.slice(url.lastIndexOf('/') + 1);
    // No %2F, no colon, no space: an encoded slash in a path is refused by
    // enough proxies to be worth avoiding entirely.
    expect(segment).toMatch(/^[A-Za-z0-9_-]+\.glb$/);
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it('round-trips the asset id the route has to look up', () => {
    for (const id of ['prophaus:ec:1042', 'prophaus:hpr:chairs%2Fwing back', 'prophaus:pina:ünï']) {
      expect(decodeAssetPath(encodeAssetPath(id))).toBe(id);
    }
  });

  it('refuses a mangled segment rather than resolving it to something else', () => {
    expect(decodeAssetPath('not base64!')).toBeNull();
    expect(decodeAssetPath('')).toBeNull();
  });
});
