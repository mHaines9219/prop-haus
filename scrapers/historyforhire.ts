import { writeSource } from './common/run';

const SOURCE = 'historyforhire' as const;

// TODO: History For Hire (https://www.historyforhire.com) returns HTTP 403
// Forbidden on automated requests (including with browser-like User-Agent).
// /sitemap.xml also returns 403. The site has aggressive anti-bot / WAF
// protection that rejects non-interactive clients. Google cache is no longer
// available as a workaround. Specialty: historical / period props
// (1700s-1980s), one of the deepest historical inventories in LA.
// Path forward: headless browser with stealth plugin (Playwright + browser
// fingerprint evasion) and human-like pacing, OR direct contact to request
// a CSV / partnership feed. Pure HTTP scraping is not viable.

async function main() {
  const items: ReturnType<typeof import('./common/run').normalize>[] = [];
  await writeSource(SOURCE, items);
}

main().catch((e) => { console.error(e); process.exit(1); });
