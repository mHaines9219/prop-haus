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

describe('JSON-LD edge cases', () => {
  const page = (head: string, body = '') => `<html><head>${head}</head><body>${body}</body></html>`;
  const ld = (json: string) => `<script type="application/ld+json">${json}</script>`;
  const URL = 'https://www.example-store.com/p';

  it('ignores a malformed block and an empty one, then reads the next tier', () => {
    const html = page(
      ld('{not json') + ld('   ') + '<meta property="og:title" content="From OG">',
    );
    expect(parseListing(html, URL)!.name).toBe('From OG');
  });

  it('finds a Product whose @type is an array', () => {
    const html = page(ld('{"@type":["Thing","Product"],"name":"Arrayed"}'));
    expect(parseListing(html, URL)!.name).toBe('Arrayed');
  });

  it('skips non-Product nodes even when they carry a name', () => {
    const html = page(
      ld('{"@type":"Organization","name":"The Store"}') + '<title>Page Title</title>',
    );
    expect(parseListing(html, URL)!.name).toBe('Page Title');
  });

  it('reads the image from a string, an array, or an ImageObject', () => {
    const cases: Array<[string, string]> = [
      ['"https://cdn/a.jpg"', 'https://cdn/a.jpg'],
      ['[" ", {"url":"https://cdn/b.jpg"}, "https://cdn/c.jpg"]', 'https://cdn/b.jpg'],
      ['{"@type":"ImageObject","url":" https://cdn/d.jpg "}', 'https://cdn/d.jpg'],
      ['{"@type":"ImageObject","contentUrl":"https://cdn/e.jpg"}', ''],
    ];
    for (const [image, expected] of cases) {
      const html = page(ld(`{"@type":"Product","name":"X","image":${image}}`));
      expect(parseListing(html, URL)!.image ?? '', image).toBe(expected);
    }
  });

  it('reads the price from an Offer, an offer array, or an AggregateOffer', () => {
    const cases: Array<[string, { amount: number; currency: string } | undefined]> = [
      ['{"price":"1,299.00","priceCurrency":"EUR"}', { amount: 1299, currency: 'EUR' }],
      ['[{"foo":1},{"price":42}]', { amount: 42, currency: 'USD' }],
      ['{"@type":"AggregateOffer","lowPrice":"10","highPrice":"20"}', { amount: 10, currency: 'USD' }],
      ['{"@type":"AggregateOffer","highPrice":20}', { amount: 20, currency: 'USD' }],
      ['{"price":"call for pricing"}', undefined],
      ['"free"', undefined],
    ];
    for (const [offers, expected] of cases) {
      const html = page(ld(`{"@type":"Product","name":"X","offers":${offers}}`));
      expect(parseListing(html, URL)!.price, offers).toEqual(expected);
    }
  });

  it('fills a field JSON-LD lacks from the next tier without overriding what it had', () => {
    const html = page(
      ld('{"@type":"Product","name":"LD Name"}') +
        '<meta property="og:title" content="OG Name">' +
        '<meta property="product:price:amount" content="$99">' +
        '<meta property="og:description" content="OG desc">',
    );
    const preview = parseListing(html, URL)!;
    expect(preview.name).toBe('LD Name');
    expect(preview.price).toEqual({ amount: 99, currency: 'USD' });
    expect(preview.description).toBe('OG desc');
  });
});

describe('meta and fallback edge cases', () => {
  const page = (head: string, body = '') => `<html><head>${head}</head><body>${body}</body></html>`;
  const URL = 'https://www.example-store.com/p';

  it('prefers og:image:secure_url and twitter:title as a name fallback', () => {
    const html = page(
      '<meta name="twitter:title" content="Tweeted">' +
        '<meta property="og:image" content="http://cdn/plain.jpg">' +
        '<meta property="og:image:secure_url" content="https://cdn/secure.jpg">',
    );
    const preview = parseListing(html, URL)!;
    expect(preview.name).toBe('Tweeted');
    expect(preview.image).toBe('https://cdn/secure.jpg');
  });

  it('treats a whitespace-only og:title as missing', () => {
    const html = page('<meta property="og:title" content="   "><title>Real Title</title>');
    expect(parseListing(html, URL)!.name).toBe('Real Title');
  });

  it('reads the meta currency and clamps a long name and description', () => {
    const html = page(
      `<meta property="og:title" content="${'n'.repeat(400)}">` +
        `<meta property="og:description" content="${'d'.repeat(5000)}">` +
        '<meta property="og:price:amount" content="12.5">' +
        '<meta property="og:price:currency" content="GBP">',
    );
    const preview = parseListing(html, URL)!;
    expect(preview.name).toHaveLength(300);
    expect(preview.description).toHaveLength(4000);
    expect(preview.price).toEqual({ amount: 12.5, currency: 'GBP' });
  });

  it('skips data: images, honours data-src, and takes the largest declared area', () => {
    const html = page(
      '<title>T</title>',
      '<img src="data:image/png;base64,AAAA" width="9000" height="9000">' +
        '<img data-src="https://cdn/lazy.jpg" width="100" height="100">' +
        '<img src="https://cdn/big.jpg" width="200" height="300">' +
        '<img src="https://cdn/nodims.jpg">',
    );
    expect(parseListing(html, URL)!.image).toBe('https://cdn/big.jpg');
  });

  it('still picks an image when no <img> declares dimensions', () => {
    const html = page('<title>T</title>', '<img src="https://cdn/only.jpg">');
    expect(parseListing(html, URL)!.image).toBe('https://cdn/only.jpg');
  });

  it('omits the image key entirely when nothing usable exists', () => {
    const html = page('<title>T</title>', '<img src="data:image/gif;base64,R0">');
    const preview = parseListing(html, URL)!;
    expect(preview).not.toHaveProperty('image');
    expect(preview).not.toHaveProperty('price');
    expect(preview).not.toHaveProperty('description');
  });

  it('leaves a non-wfcdn image alone on a Wayfair page', () => {
    const html = page('<meta property="og:title" content="Sofa"><meta property="og:image" content="https://other.cdn/a.jpg?w=1">');
    const preview = parseListing(html, 'https://www.wayfair.com/x')!;
    expect(preview.image).toBe('https://other.cdn/a.jpg?w=1');
    expect(preview.retailer).toBe('Wayfair');
  });

  it('returns null for a whitespace-only title and no other name', () => {
    expect(parseListing('<html><head><title>   </title></head></html>', URL)).toBeNull();
  });
});
