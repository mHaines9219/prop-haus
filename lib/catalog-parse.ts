/**
 * Shared per-item validation for the scraped catalog.
 *
 * WHY THIS EXISTS
 *
 * `Catalog.parse()` validates the array as a unit, so a single bad record fails
 * all ~90k. That is not a hypothetical: a scrape introduced two vendors missing
 * from the `SOURCES` enum, `lib/catalog.ts` swallowed the throw, and the app
 * served an empty catalog with no error anywhere. A bad scrape of one vendor
 * should cost us that vendor, not the inventory.
 *
 * That fix lived in `loadCatalog` alone. Four other places parsed the same file
 * the same unguarded way, so the same input that the app survives would still
 * take down the pipeline. This is that logic, extracted once.
 *
 * TWO CALLERS, TWO DIFFERENT RIGHT ANSWERS
 *
 * `parseCatalogItems` is LENIENT: it keeps the survivors and reports the rest.
 * The running app must not go blank because one vendor's scrape regressed.
 *
 * `parseCatalogItemsStrict` REFUSES to proceed on any drop. A pipeline step
 * that quietly embeds, enriches or loads 95% of the catalog produces a wrong
 * result that looks like a right one — and it is the pipeline's job to surface
 * a bad scrape, not to route around it. The remedy is `pnpm data:prune`, which
 * drops the invalid records deliberately and rewrites both artifacts together.
 */
import { PropItem } from './types';
import type { ZodIssue } from 'zod';

export type RejectionReason = { reason: string; count: number };

export type CatalogParseReport = {
  /** Records that validated, in input order. */
  items: PropItem[];
  /** Records examined. Zero when the input was not an array at all. */
  total: number;
  /** Records that failed validation. */
  dropped: number;
  /** Distinct failure reasons, most frequent first. */
  reasons: RejectionReason[];
  /** True when the input was not an array — a malformed file, not bad records. */
  malformed: boolean;
};

/**
 * Group a rejected record under a key specific enough to name the culprit.
 *
 * An unknown `source` is called out by name because it is both the likeliest
 * cause and the only one where the reason is actionable on sight — it means a
 * scraper landed in the data file before its enum entry landed in the repo.
 */
function rejectionKey(issues: ZodIssue[]): string {
  const enumIssue = issues.find((i) => i.code === 'invalid_enum_value' && i.path[0] === 'source');
  if (enumIssue && 'received' in enumIssue) return `unknown source "${String(enumIssue.received)}"`;
  const first = issues[0];
  return first ? `${first.path.join('.') || '<root>'}: ${first.code}` : 'unknown';
}

/** Validate each record independently. Never throws. */
export function parseCatalogItems(entries: unknown): CatalogParseReport {
  if (!Array.isArray(entries)) {
    return {
      items: [],
      total: 0,
      dropped: 0,
      reasons: [{ reason: `input is not an array — got ${typeof entries}`, count: 1 }],
      malformed: true,
    };
  }

  const items: PropItem[] = [];
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const result = PropItem.safeParse(entry);
    if (result.success) {
      items.push(result.data);
    } else {
      const key = rejectionKey(result.error.issues);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const reasons = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    items,
    total: entries.length,
    dropped: entries.length - items.length,
    reasons,
    malformed: false,
  };
}

/** One-line summary naming the culprits, or null when nothing was rejected. */
export function describeRejections(report: CatalogParseReport, label: string): string | null {
  if (report.reasons.length === 0) return null;
  const breakdown = report.reasons.map((r) => `${r.count}x ${r.reason}`).join('; ');
  if (report.malformed) return `[${label}] ${breakdown}`;
  return `[${label}] dropped ${report.dropped} of ${report.total} invalid items — ${breakdown}`;
}

/**
 * Validate for a pipeline step. Throws rather than silently working on a subset.
 *
 * `label` names the caller so the message says which step refused, and the
 * message names the remedy — otherwise the reader's next move is to delete the
 * check.
 */
export function parseCatalogItemsStrict(entries: unknown, label: string): PropItem[] {
  const report = parseCatalogItems(entries);
  const summary = describeRejections(report, label);
  if (summary) {
    throw new Error(
      `${summary}\n` +
        `Refusing to continue on a partial catalog — a pipeline step that processes ` +
        `${report.items.length} of ${report.total} items produces a wrong result that looks ` +
        `like a right one.\n` +
        `Run \`pnpm data:prune\` to drop the invalid records from the catalog and the ` +
        `embedding index together, then retry.`,
    );
  }
  return report.items;
}
