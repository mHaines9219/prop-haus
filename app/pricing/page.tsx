import { PageShell } from '@/components/ap/page-shell';
import { PricingTiers } from '@/components/ap/pricing-tiers';
import { PRICING_FAQ } from '@/lib/pricing';

export const metadata = {
  title: 'Rates — Prop Haus',
  description:
    'Browse the catalog free. Directory shows every prop house. Coordinator adds AI search, one-click checkout, and the vendor emails and paperwork done for you.',
};

/**
 * The rate card page: the three tier ads on a cream sheet, then the four
 * questions a reader asks before subscribing, as ruled rows. Linked from the
 * footer and from the home page's Rates section.
 */
export default function PricingPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 md:py-16">
        <p className="listing">
          <span>Rates</span>
          <span>USD</span>
          <span>Billed monthly</span>
        </p>
        <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
          Search free. Pay for the work.
        </h1>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-[23px] text-text-secondary">
          The catalog is open to everyone. A plan adds the house behind each piece, then the
          emails and forms a coordinator would send after the pull.
        </p>

        <PricingTiers className="mt-10" />

        <p className="mt-4 text-[12px] leading-[18px] text-text-tertiary">
          Prices in USD, per organization, billed monthly. Cancel any time.
        </p>

        <section aria-labelledby="faq-heading" className="mt-14">
          <h2
            id="faq-heading"
            className="font-heading text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-tertiary"
          >
            Questions
          </h2>
          <dl className="mt-3 border-t-2 border-ink">
            {PRICING_FAQ.map((row) => (
              <div
                key={row.q}
                className="grid gap-1 border-b border-border py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-6"
              >
                <dt className="text-[15px] font-bold text-foreground">{row.q}</dt>
                <dd className="text-[14px] leading-[21px] text-text-secondary">{row.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </PageShell>
  );
}
