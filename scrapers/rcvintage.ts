import { writeSource, type RawItem } from './common/run';

const SOURCE = 'rcvintage' as const;

// TODO: RC Vintage (https://www.rcvintage.com) does not publish an online
// catalog. The homepage is essentially a contact card: business hours, the
// tagline "Serving Vintage and Mid-Century Americana from 1930 to 2000... we
// carry a Large Lighting and Neon Selection", a phone number (818.765.6673),
// and an "Admin Only" login. There are no product pages, gallery, or sitemap
// to scrape. Specialty: neon + mid-century Americana lighting.
// Path forward: in-person visit at the North Hollywood showroom, phone/email
// inquiry, or request a PDF/photo catalog and seed manually.

async function main() {
  const items: ReturnType<typeof import('./common/run').normalize>[] = [];
  await writeSource(SOURCE, items);
}

type _Raw = RawItem;

main().catch((e) => { console.error(e); process.exit(1); });
