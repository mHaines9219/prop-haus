import { SOURCE_META } from './types';
import { isBillable, lineTotal, proposalTotals, type Project } from './projects';

/**
 * A consolidated proposal as CSV.
 *
 * CSV rather than PDF, deliberately: a proposal is a budgeting document before
 * it is a client-facing one, and a production coordinator puts these numbers
 * into a spreadsheet. CSV lands there with no new dependency. A PDF is the
 * better artifact to hand a client and is a separate piece of work.
 *
 * TWO THINGS THIS FILE EXISTS TO GET RIGHT
 *
 * 1. Escaping. Item names come from vendor scrapes and routinely contain commas
 *    ("Sofa, tufted, green"), quotes ('12" riser') and occasionally newlines. An
 *    export that splits a row on one of those silently corrupts a budget.
 *
 * 2. Formula injection. This is the one that matters more, and it is specific to
 *    exporting THIRD-PARTY TEXT into a spreadsheet. Excel and Google Sheets
 *    evaluate any cell beginning `=`, `+`, `-` or `@` as a formula. A vendor
 *    listing named `=1+1` is merely odd; the same field is the delivery vector
 *    for `=HYPERLINK(...)` and remote-content formulas. We never author these
 *    names, so we cannot assume they are inert.
 *
 * Totals come from `proposalTotals` rather than being re-summed here, so the
 * exported grand total cannot drift from the one on the page.
 */

/** Cells beginning with these are evaluated as formulas by Excel and Sheets. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Quote a value for CSV, and neutralise it as a formula.
 *
 * The leading apostrophe is the conventional defence: spreadsheets treat it as
 * "this is text", strip it on display, and it survives a round trip. Prefixing
 * rather than stripping means the original value is still legible to a human,
 * which matters when the field is a real product name that happens to start
 * with a hyphen.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);

  if (FORMULA_PREFIXES.some((p) => s.startsWith(p))) s = `'${s}`;

  // Quote when the value contains a delimiter, a quote, or any newline; double
  // any embedded quotes, per RFC 4180.
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

/** Two decimal places, no thousands separator — this is a number a spreadsheet must parse. */
function money(n: number): string {
  return n.toFixed(2);
}

function unitLabel(item: Parameters<typeof lineTotal>[0]): string {
  if (!item.quote) return '';
  return item.quote.periods === 1
    ? `per ${item.quote.unit}`
    : `${item.quote.periods} x ${item.quote.unit}`;
}

/**
 * CRLF line endings, per RFC 4180 — Excel on Windows is the most likely
 * destination and is the least forgiving about bare newlines.
 */
export function proposalToCsv(project: Project): string {
  const { vendors, grandTotal } = proposalTotals(project);
  const lines: string[] = [];

  // A short header block: whoever opens this months later needs to know which
  // production and which dates it priced, and a bare table does not say.
  lines.push(row(['Prop Haus consolidated proposal']));
  lines.push(row(['Production', project.productionName]));
  lines.push(row(['Project', project.id]));
  lines.push(row(['Dates', `${project.startDate} to ${project.endDate}`]));
  lines.push(row(['Status', project.status]));
  lines.push('');

  lines.push(
    row([
      'Vendor',
      'Item',
      'Status',
      'Qty',
      'Rate',
      'Unit',
      'Currency',
      'Line total',
      'Substitution note',
    ]),
  );

  for (const { vendor, subtotal } of vendors) {
    const vendorName = SOURCE_META[vendor.vendor]?.name ?? vendor.vendor;

    for (const item of vendor.items) {
      // Unquoted and unavailable lines are still listed. A proposal that showed
      // only the priced lines would hide what a vendor could NOT supply, which
      // is half of what the document is for.
      const billable = isBillable(item);
      lines.push(
        row([
          vendorName,
          item.name,
          item.status,
          item.qty,
          item.quote ? money(item.quote.amount) : '',
          unitLabel(item),
          item.quote?.currency ?? '',
          billable && item.quote ? money(lineTotal(item)) : '',
          item.subNote ?? '',
        ]),
      );
    }

    lines.push(row([vendorName, 'Vendor subtotal', '', '', '', '', '', money(subtotal), '']));
  }

  lines.push('');
  lines.push(row(['', 'GRAND TOTAL', '', '', '', '', '', money(grandTotal), '']));
  lines.push('');
  lines.push(
    row([
      'Estimate only. Line totals reflect vendor-quoted rates and billable periods; '
        + 'they are not an invoice and do not include tax, delivery or damage waiver.',
    ]),
  );

  return lines.join('\r\n');
}

/** `prop-haus-proposal-<production>-<id>.csv`, safe on every filesystem. */
export function proposalFilename(project: Project): string {
  const slug = project.productionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `prop-haus-proposal-${slug || 'project'}-${project.id.slice(0, 8)}.csv`;
}
