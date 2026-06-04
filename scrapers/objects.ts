import { writeSource } from './common/run';

const SOURCE = 'objects' as const;

// TODO: Ob-jects (https://www.ob-jects.com) is a Drupal 10 site fronted by
// Cloudflare's "managed challenge". The homepage is fetchable, but the
// catalog (/collection and any filtered/paginated variants) returns a
// Cloudflare interstitial ("Enable JavaScript and cookies to continue")
// instead of HTML. Bypassing this requires a real browser session
// (Playwright with stealth, or a Cloudflare-aware fetcher), which is out of
// scope here. Emitting an empty array for now.

async function main() {
  await writeSource(SOURCE, []);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
