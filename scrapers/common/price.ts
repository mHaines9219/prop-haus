import type { CheerioAPI } from 'cheerio';
import type { Price } from '../../lib/types';

// Best-effort rental-price extraction shared by all scrapers. Returns undefined
// when a page publishes no price (quote-only houses) — that's the common case,
// and the caller just omits price. Tries the markup patterns vendors actually
// use, in order of reliability: WooCommerce price block, JSON-LD offers, then
// OpenGraph product price.

const SYMBOL_TO_CURRENCY: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR' };

// Shopify /products.json lists each rental tier as a variant (1-day, 2-3 day,
// weekly, …). The lowest positive variant is the base/starting rental rate.
// Returns undefined when nothing has a real price (e.g. all 0.00).
export function priceFromShopifyVariants(
  variants?: Array<{ price?: string | number }>,
): Price | undefined {
  if (!variants?.length) return undefined;
  const amounts = variants
    .map((v) => Number(v.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!amounts.length) return undefined;
  return { amount: Math.min(...amounts), currency: 'USD' };
}

function parseAmount(text: string): number | undefined {
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function currencyFromSymbol(sym: string): string {
  for (const [s, c] of Object.entries(SYMBOL_TO_CURRENCY)) if (sym.includes(s)) return c;
  return 'USD';
}

export function extractPrice($: CheerioAPI): Price | undefined {
  // 1. WooCommerce — the product price block, not a "related products" price.
  const wc = $(
    '.summary .woocommerce-Price-amount, p.price .woocommerce-Price-amount, .woocommerce-Price-amount',
  ).first();
  if (wc.length) {
    const amount = parseAmount(wc.text());
    if (amount !== undefined) {
      const sym = wc.find('.woocommerce-Price-currencySymbol').first().text() || '$';
      return { amount, currency: currencyFromSymbol(sym) };
    }
  }

  // 2. JSON-LD Product offers (Shopify and many custom carts).
  let found: Price | undefined;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const data = JSON.parse($(el).contents().text());
      for (const node of Array.isArray(data) ? data : [data]) {
        const offers = node?.offers;
        const offer = Array.isArray(offers) ? offers[0] : offers;
        const raw = offer?.price ?? offer?.lowPrice;
        if (raw != null) {
          const amount = parseAmount(String(raw));
          if (amount !== undefined) {
            found = { amount, currency: offer?.priceCurrency || 'USD' };
            return;
          }
        }
      }
    } catch {
      // ignore malformed ld+json
    }
  });
  if (found) return found;

  // 3. OpenGraph product price meta.
  const ogAmount = $(
    'meta[property="product:price:amount"], meta[property="og:price:amount"]',
  ).attr('content');
  if (ogAmount) {
    const amount = parseAmount(ogAmount);
    if (amount !== undefined) {
      const cur =
        $('meta[property="product:price:currency"], meta[property="og:price:currency"]').attr(
          'content',
        ) || 'USD';
      return { amount, currency: cur };
    }
  }

  return undefined;
}
