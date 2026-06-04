import { writeSource } from './common/run';

const SOURCE = 'pina' as const;

// TODO: Pina Props (https://pinaprops.com) runs on Propcart Pro — a Next.js
// frontend that fetches inventory client-side from Firestore. The category
// pages (e.g. /rentals/Furniture) return a loading spinner in raw HTML with
// no product data embedded; the sitemap only lists category URLs, not items;
// individual product pages have no stable URL pattern that's reachable
// without running the JS. Scraping this site requires a headless browser
// (Playwright/Puppeteer) or reverse-engineering the Firestore query, both of
// which are out of scope here. Emitting an empty array for now.

async function main() {
  await writeSource(SOURCE, []);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
