import { writeSource, type RawItem } from './common/run';

const SOURCE = 'warnerbros' as const;

// TODO: Warner Bros. Property (https://property.warnerbros.com) is login-gated.
// Homepage navigation reveals a robust category taxonomy (Armor, Appliances,
// Bedroom, Kitchen, Office, etc.) and a "New Arrivals" section, but all
// product detail pages, images, and listings require an authenticated account.
// Category tiles render as "Loading-BroadCategory.gif" placeholders for
// anonymous visitors; the SPA hydrates real content only after auth.
// Path forward: manual seed (CSV from a credentialed contact at WB Property)
// or formal API/partnership. No scraping route available without credentials.

async function main() {
  const items: ReturnType<typeof import('./common/run').normalize>[] = [];
  // Intentionally empty until auth/manual seed is available.
  await writeSource(SOURCE, items);
}

// Reference for typing; not invoked.
type _Raw = RawItem;

main().catch((e) => { console.error(e); process.exit(1); });
