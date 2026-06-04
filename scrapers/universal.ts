import { writeSource } from './common/run';

// Universal Studios Property Department (https://props.universalstudios.com).
// TODO: The site sits behind Cloudflare with an interstitial challenge — direct
// HTTP requests return HTTP 403 ("Attention Required! | Cloudflare") regardless
// of user-agent / headers. This is a studio-owned facility that historically
// requires a verified production account to browse inventory; bypassing the
// challenge would require either a headless browser with CF turnstile solving
// or a real authenticated session, neither of which we want to bake into the
// MVP scraper layer.
// When credentials / a vendor relationship are available, swap this stub for a
// real implementation (likely Playwright-driven with persisted cookies).

const SOURCE = 'universal' as const;

async function main() {
  await writeSource(SOURCE, []);
  console.log('universal: stub — blocked by Cloudflare 403 + studio-only access');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
