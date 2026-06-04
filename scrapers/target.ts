import { writeSource } from './common/run';

// Target Props (https://targetprops.com).
// TODO: Site is a Propcart Pro client-rendered Next.js app backed by Firestore.
// - `robots.txt` is `Disallow: /` (we should honor this until we have permission).
// - `/sitemap.xml` lists only category URLs, no /item/<id> URLs to enumerate.
// - Category pages contain zero items in server HTML — products are fetched from
//   `firestore.googleapis.com` at runtime.
// - Account creation is required to see prices / full details ("Create an
//   account to get started" CTA on landing).
// Individual `/item/<id>` pages DO have OG title + OG image server-rendered, so
// once we obtain an item-id source (vendor feed, Propcart partner API, or a
// signed-in crawl) we can enrich; until then this scraper is a stub.

const SOURCE = 'target' as const;

async function main() {
  await writeSource(SOURCE, []);
  console.log('target: stub — blocked by Firestore-backed SPA + robots.txt + login wall');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
