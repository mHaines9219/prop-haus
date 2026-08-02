import { describe, expect, it } from 'vitest';
import { csvCell, proposalFilename, proposalToCsv } from './proposal-csv';
import { proposalTotals, type LineItem, type Project, type VendorRequest } from './projects';

/**
 * Two failure modes, both specific to writing scraped vendor text into a file a
 * production opens in Excel.
 *
 *   - A delimiter inside an item name silently corrupts a budget row.
 *   - A leading `=` is executed as a formula. We never author these names.
 *
 * Plus the one that would be worst: the exported grand total disagreeing with
 * the page it came from.
 */

const item = (over: Partial<LineItem> = {}): LineItem => ({
  itemId: 'i1',
  sourceId: 's1',
  name: 'Chair',
  qty: 1,
  status: 'available',
  quote: { amount: 100, unit: 'day', periods: 1, currency: 'USD' },
  ...over,
});

const vendor = (over: Partial<VendorRequest> = {}): VendorRequest => ({
  vendor: 'gilandroy',
  status: 'responded',
  token: 't',
  items: [item()],
  coi: { status: 'not-required', compatibility: { status: 'not-required' } as never },
  ...over,
});

const project = (vendors: VendorRequest[]): Project => ({
  id: 'abcdef0123456789',
  orgId: 'org-1',
  createdAt: '2026-08-01T00:00:00Z',
  status: 'proposed',
  productionName: 'Nightfall',
  productionType: 'commercial',
  startDate: '2026-09-01',
  endDate: '2026-09-05',
  deliveryAddress: 'a',
  contactName: 'n',
  contactEmail: 'e@x.com',
  contactPhone: 'p',
  vendors,
});

describe('csvCell', () => {
  it('passes ordinary values through untouched', () => {
    expect(csvCell('Chair')).toBe('Chair');
    expect(csvCell(12)).toBe('12');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes values containing a delimiter, and doubles embedded quotes', () => {
    // Real vendor names look like this constantly.
    expect(csvCell('Sofa, tufted, green')).toBe('"Sofa, tufted, green"');
    expect(csvCell('12" riser')).toBe('"12"" riser"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('neutralises formulas, which is the point of this function', () => {
    // Excel and Sheets evaluate any cell starting with these. Item names come
    // from vendor scrapes, so they are third-party text by definition.
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('=HYPERLINK("http://evil.example","click")')).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""click"")"',
    );
    expect(csvCell('+SUM(A1:A9)')).toBe("'+SUM(A1:A9)");
    expect(csvCell('@import')).toBe("'@import");
  });

  it('still neutralises a hyphen-led name, and keeps it readable', () => {
    // "-- Vintage lot 4" is a plausible listing; the apostrophe is stripped on
    // display, so the human still sees the original.
    expect(csvCell('-- Vintage lot 4')).toBe("'-- Vintage lot 4");
  });
});

describe('proposalToCsv', () => {
  it('agrees with proposalTotals rather than re-summing', () => {
    const p = project([
      vendor({ items: [item({ qty: 2, quote: { amount: 100, unit: 'day', periods: 3, currency: 'USD' } })] }),
      vendor({ vendor: 'omega', token: 't2', items: [item({ itemId: 'i2', name: 'Lamp' })] }),
    ]);
    const csv = proposalToCsv(p);
    const { grandTotal } = proposalTotals(p);

    expect(grandTotal).toBe(700); // 100*2*3 + 100*1*1
    expect(csv).toContain(`,GRAND TOTAL,,,,,,${grandTotal.toFixed(2)},`);
    expect(csv).toContain('600.00'); // the multi-period line
  });

  it('lists unavailable lines with a blank total rather than hiding them', () => {
    // Half the value of a proposal is what a vendor could NOT supply.
    const csv = proposalToCsv(
      project([vendor({ items: [item({ status: 'unavailable', quote: undefined })] })]),
    );
    expect(csv).toContain('Chair,unavailable,1');
    expect(csv).toContain(',GRAND TOTAL,,,,,,0.00,');
  });

  it('uses CRLF, because Excel on Windows is the least forgiving reader', () => {
    const csv = proposalToCsv(project([vendor()]));
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n').length).toBeGreaterThan(5);
  });

  it('carries the production and dates, not just a bare table', () => {
    const csv = proposalToCsv(project([vendor()]));
    expect(csv).toContain('Nightfall');
    expect(csv).toContain('2026-09-01 to 2026-09-05');
  });

  it('escapes a hostile item name inside a real row', () => {
    const csv = proposalToCsv(
      project([vendor({ items: [item({ name: '=cmd|calc,"x"' })] })]),
    );
    // Neutralised AND quoted; the row still has its normal column count.
    expect(csv).toContain(`"'=cmd|calc,""x"""`);
  });
});

describe('proposalFilename', () => {
  it('slugs the production name and is filesystem-safe', () => {
    expect(proposalFilename(project([vendor()]))).toBe('prop-haus-proposal-nightfall-abcdef01.csv');
  });

  it('survives a name with no usable characters', () => {
    const p = { ...project([vendor()]), productionName: '///' };
    expect(proposalFilename(p)).toBe('prop-haus-proposal-project-abcdef01.csv');
  });
});
