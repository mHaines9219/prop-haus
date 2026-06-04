import { writeSource } from './common/run';

const SOURCE = 'alpha' as const;

// TODO: alphaprops.com is a Rental Tracker Inc. React SPA. The full HTML response is a
// JS-only shell (no SSR), all inventory is loaded via authenticated API calls behind a
// login wall (see /login, "Rental Tracker Inc." x-powered-by header). Public scraping
// would require: (a) headless browser + (b) valid credentials. Out of scope for the
// fetch-only MVP — leaving as empty stub so merge/enrich pipelines stay clean.
//
// Re-visit options:
//   - request demo credentials from Alpha
//   - puppeteer/playwright after authentication
//   - check if they have a public API or partner feed

async function main() {
  await writeSource(SOURCE, []);
}

main().catch((e) => { console.error(e); process.exit(1); });
