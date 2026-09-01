import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseListing } from './parse';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('parseListing', () => {
  it('reads a Wayfair JSON-LD @graph Product and refines the wfcdn image', () => {
    const preview = parseListing(
      fixture('wayfair-jsonld.html'),
      'https://www.wayfair.com/furniture/pdp/reordan-sofa-w1002834561.html',
    );
    expect(preview).not.toBeNull();
    expect(preview!.name).toBe("Reordan 84'' Velvet Rolled Arm Sofa"); // JSON-LD wins over OG
    expect(preview!.price).toEqual({ amount: 1299.99, currency: 'USD' });
    expect(preview!.retailer).toBe('Wayfair');
    // Wayfair rule strips the downscaling query off the wfcdn asset.
    expect(preview!.image).toBe(
      'https://assets.wfcdn.com/im/12345678/resize-h800-w800%5Ecompr-r85/reordan.jpg',
    );
    expect(preview!.description).toContain('tufted velvet');
  });

  it('falls back to OpenGraph when there is no JSON-LD', () => {
    const preview = parseListing(
      fixture('opengraph.html'),
      'https://www.example-store.com/brass-arc-lamp',
    );
    expect(preview).not.toBeNull();
    expect(preview!.name).toBe('Brass Arc Floor Lamp');
    expect(preview!.image).toBe('https://cdn.example-store.com/lamp-1200.jpg');
    expect(preview!.price).toEqual({ amount: 349, currency: 'USD' });
    // No retailer override → bare hostname label.
    expect(preview!.retailer).toBe('example-store.com');
  });

  it('falls back to <title> and the largest declared <img>', () => {
    const preview = parseListing(
      fixture('title-fallback.html'),
      'https://www.example-store.com/teak-sideboard',
    );
    expect(preview).not.toBeNull();
    expect(preview!.name).toBe('Vintage Teak Sideboard — Midcentury Finds');
    // Largest by width*height, and never a data: URI.
    expect(preview!.image).toBe('https://cdn.example-store.com/hero.jpg');
    expect(preview!.price).toBeUndefined();
  });

  it('returns null when there is no name anywhere (bot wall / empty shell)', () => {
    expect(parseListing('<html><head></head><body></body></html>', 'https://x.com/p')).toBeNull();
  });
});
