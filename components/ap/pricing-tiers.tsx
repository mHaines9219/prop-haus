import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatMonthly, PRICING_TIERS, tierHref, type PricingTier } from '@/lib/pricing';

/**
 * The rate card (DESIGN.md §9.2 ad boxes): one cream ad per tier in a row.
 * Each box is its own `.sheet`, so it prints the same on the vinyl of the
 * home page and on the paper of /pricing. The tier name is the red condensed
 * headline, the monthly rate is the box's one coral tag (the ad's phone
 * number), and the features are ruled listing rows. The recommended tier
 * carries a 2px heavy rule and a cream index tab, never a second coral tag.
 */
export function PricingTiers({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-3', className)}>
      {PRICING_TIERS.map((tier) => (
        <TierAd key={tier.id} tier={tier} />
      ))}
    </div>
  );
}

function TierAd({ tier }: { tier: PricingTier }) {
  return (
    <article
      aria-labelledby={`tier-${tier.id}`}
      className={cn(
        'sheet lift relative flex flex-col border-ink bg-card p-5 text-foreground sm:p-6',
        // The index tab rises 13px above the rule; when the ads stack, leave it room.
        tier.recommended ? 'mt-3 border-2 lg:mt-0' : 'border-[1.5px]',
      )}
    >
      {tier.recommended && (
        <span className="absolute -top-[13px] left-4 border-[1.5px] border-ink bg-paper-lit px-2 py-1 font-heading text-[10px] font-extrabold uppercase leading-none tracking-[0.1em] text-ink">
          For most productions
        </span>
      )}

      <p className="listing">
        <span>{tier.eyebrow}</span>
      </p>

      <h3 id={`tier-${tier.id}`} className="ad-headline mt-3 text-[30px]">
        {tier.name}
      </h3>

      <p className="mt-2 min-h-[38px] text-[13px] leading-[19px] text-text-secondary">{tier.tagline}</p>

      <div className="mt-4 flex items-baseline gap-2.5">
        <span className="tag tag-lg">{formatMonthly(tier.monthly)}</span>
        {tier.monthly > 0 && (
          <span className="font-heading text-[11px] font-extrabold uppercase tracking-[0.08em] text-text-tertiary">
            per month
          </span>
        )}
      </div>

      <ul className="mt-5 border-t-2 border-ink">
        {tier.features.map((f) => (
          <li
            key={f.label}
            className={cn(
              'flex items-baseline gap-2.5 border-b border-border py-2 text-[13px] leading-[18px]',
              f.included ? 'text-foreground' : 'text-text-disabled',
            )}
          >
            <span aria-hidden className={cn('font-bold', f.included ? 'text-accent-text' : 'text-text-disabled')}>
              {f.included ? '•' : '—'}
            </span>
            <span>
              {f.label}
              {!f.included && <span className="sr-only"> (not included)</span>}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={tierHref(tier)}
        className={cn(
          'mt-6 block border-[1.5px] border-ink px-4 py-2.5 text-center font-heading text-[13px] font-extrabold uppercase tracking-[0.04em] transition-[background-color,color] duration-200 ease-attend',
          tier.recommended
            ? 'bg-accent text-accent-foreground hover:bg-primary-hover'
            : 'bg-transparent text-foreground hover:bg-foreground hover:text-background',
        )}
      >
        {tier.cta}
      </Link>
    </article>
  );
}

/**
 * The home-page section: the rate card on the vinyl under a section eyebrow,
 * with the full rate card one link away.
 */
export function PricingSection() {
  return (
    <section id="rates" aria-labelledby="rates-heading">
      <div className="mx-auto w-full max-w-[1400px] px-3 pb-10 sm:px-5 sm:pb-14">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <p
            id="rates-heading"
            className="flex items-center gap-2.5 font-heading text-[11px] font-extrabold uppercase tracking-[0.14em] text-binder-foreground/80"
          >
            <span aria-hidden className="inline-block h-[3px] w-6 bg-coral" />
            Rates
          </p>
          <Link
            href="/pricing"
            className="ink-underline font-heading text-[11px] font-extrabold uppercase tracking-[0.1em] text-binder-foreground/80 hover:text-binder-foreground"
          >
            Full rate card
          </Link>
        </div>
        <PricingTiers className="pt-3" />
      </div>
    </section>
  );
}
