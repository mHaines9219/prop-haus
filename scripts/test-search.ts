/**
 * Smoke tests for the multimodal Ask AI pipeline.
 *
 * Examples:
 *   npx tsx --env-file=.env scripts/test-search.ts
 *   npx tsx --env-file=.env scripts/test-search.ts --query "1950s neon gas station sign"
 *   npx tsx --env-file=.env scripts/test-search.ts --files moodboard1.jpg moodboard2.png --mode haiku
 *   npx tsx --env-file=.env scripts/test-search.ts --files board.jpg --mode haiku-then-sonnet --query "low-lit speakeasy"
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runSearch } from '../lib/search-modes';
import { shortlistByEmbedding } from '../lib/search-index';
import type { Attachment, SearchMode } from '../lib/types';
import { SEARCH_MODES } from '../lib/types';

function parseArgs() {
  const argv = process.argv.slice(2);
  const args: { query?: string; files: string[]; mode: SearchMode; quick: boolean } = {
    files: [],
    mode: 'text',
    quick: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i];
    else if (a === '--mode') {
      const v = argv[++i];
      if ((SEARCH_MODES as readonly string[]).includes(v)) args.mode = v as SearchMode;
    } else if (a === '--files') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.files.push(argv[++i]);
    } else if (a === '--quick') args.quick = true;
  }
  if (args.files.length > 0 && args.mode === 'text') args.mode = 'haiku';
  return args;
}

async function fileToAttachment(p: string): Promise<Attachment> {
  const abs = path.resolve(p);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mimes: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf',
  };
  const mime = mimes[ext] || 'application/octet-stream';
  const kind = mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : null;
  if (!kind) throw new Error(`Unsupported file extension ${ext}`);
  return { kind, mime, filename: path.basename(abs), dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
}

async function quickEval() {
  console.log('=== Quick embedding eval (no LLM rerank) ===');
  const queries = [
    '1950s neon gas station sign',
    'mid-century modern walnut credenza',
    'futuristic medical equipment for sci-fi set',
    'art deco brass chandelier',
    'antique typewriter for period drama',
  ];
  for (const q of queries) {
    console.log(`\nQ: ${q}`);
    const sl = await shortlistByEmbedding(q, 5);
    for (const { item, score } of sl) {
      const era = item.era ? `[${item.era}]` : '';
      console.log(`  ${score.toFixed(3)}  ${item.id}  ${era} ${item.name.slice(0, 90)}`);
    }
  }
}

async function main() {
  const args = parseArgs();

  if (args.quick) {
    await quickEval();
    return;
  }

  if (!args.query && args.files.length === 0) {
    args.query = '1950s neon gas station sign';
  }

  const attachments = await Promise.all(args.files.map(fileToAttachment));
  console.log(`mode=${args.mode}  query=${JSON.stringify(args.query ?? '')}  files=${attachments.length}`);

  const t0 = Date.now();
  const res = await runSearch({ query: args.query, attachments, mode: args.mode });
  const ms = Date.now() - t0;

  console.log(`\n--- response (${ms}ms, models: ${res.modelsUsed.join(' + ') || '-'}) ---`);
  if (res.error) {
    console.error('ERROR:', res.error);
    return;
  }
  if (res.interpretation) {
    const { overall, detectedItems, suggestedAdditions } = res.interpretation;
    console.log('\nSummary:', overall.summary);
    console.log('  style:', overall.style.join(', '), '| era:', overall.era, '| vibes:', overall.vibes.join(', '));
    console.log('  detected items:');
    for (const d of detectedItems) console.log(`    - ${d.label}  [${d.materials?.join(',') ?? ''}]`);
    console.log('  suggested additions:');
    for (const a of suggestedAdditions) console.log(`    + ${a.label}  — ${a.reason}`);
  } else if (res.explanation) {
    console.log('explanation:', res.explanation);
  }
  console.log(`\nMatches (${res.matches.length}):`);
  for (const m of res.matches.slice(0, 20)) {
    console.log(`  ${m.score.toFixed(2)}  ${m.item.id}  [${m.matchedVia.join('|')}]  ${m.item.name.slice(0, 70)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
