import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pLimit from 'p-limit';

const UA =
  'Mozilla/5.0 (compatible; prop-haus-mvp/0.1; +https://example.invalid/prop-haus) research-prototype';

const CACHE_DIR = path.join(process.cwd(), '.scrape-cache');
const limit = pLimit(4);

async function ensureCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function cacheKey(url: string) {
  return crypto.createHash('sha1').update(url).digest('hex');
}

async function readCache(url: string): Promise<string | null> {
  try {
    const file = path.join(CACHE_DIR, cacheKey(url) + '.html');
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function writeCache(url: string, body: string) {
  await ensureCache();
  const file = path.join(CACHE_DIR, cacheKey(url) + '.html');
  await fs.writeFile(file, body, 'utf8');
}

async function jitter(ms: number) {
  return new Promise((r) => setTimeout(r, ms + Math.random() * ms));
}

export type FetchOpts = { useCache?: boolean; retries?: number };

export async function fetchHtml(url: string, opts: FetchOpts = {}): Promise<string> {
  const useCache = opts.useCache ?? true;
  if (useCache) {
    const hit = await readCache(url);
    if (hit) return hit;
  }
  return limit(async () => {
    const retries = opts.retries ?? 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await jitter(250);
        const res = await fetch(url, {
          headers: {
            'user-agent': UA,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          // some sources have iffy certs; node will still validate, so let it
          redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const body = await res.text();
        if (useCache) await writeCache(url, body);
        return body;
      } catch (err) {
        lastErr = err;
        await jitter(500 * (attempt + 1));
      }
    }
    throw lastErr;
  });
}

export function parseLimitArg(argv: string[] = process.argv): number | undefined {
  const i = argv.indexOf('--limit');
  if (i >= 0 && argv[i + 1]) return Number(argv[i + 1]);
  return undefined;
}
