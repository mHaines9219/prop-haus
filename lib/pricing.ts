/**
 * The public rate card — what each tier is called, costs, and promises.
 *
 * This is DISPLAY data for the pricing surfaces (components/ap/pricing-tiers.tsx,
 * app/pricing). It is deliberately separate from lib/plans.ts, which is the
 * enforcement side: entitlements per PlanTier. Keep the two in step by hand;
 * a feature listed as included here should be unlocked there once gating goes
 * live. The organizations.plan column is service-role only (billing webhook),
 * so choosing a tier here never changes an org's plan — billing is not wired
 * in the MVP, and every CTA lands on sign-in.
 */

import type { PlanTier } from './accounts';

export type PricingFeature = { label: string; included: boolean };

export type PricingTier = {
  /** Stable key, also the `plan` query hint carried through sign-in. */
  id: 'browse' | 'directory' | 'coordinator';
  name: string;
  /** The gating tier this plan maps to (lib/plans.ts). */
  plan: PlanTier;
  /** Who this tier is for, in listing voice. */
  eyebrow: string;
  tagline: string;
  /** USD per month; 0 renders as "Free". */
  monthly: number;
  features: PricingFeature[];
  cta: string;
  /** The one tier that gets the heavy rule and the index tab. */
  recommended?: boolean;
};

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'browse',
    name: 'Browse',
    plan: 'free',
    eyebrow: 'Looking',
    tagline: 'Search the whole catalog. See the piece, not the house.',
    monthly: 0,
    features: [
      { label: 'Search every piece in the catalog', included: true },
      { label: 'Photos, dimensions, and rental price', included: true },
      { label: 'Prop house names and links', included: false },
      { label: 'AI search by scene or moodboard', included: false },
      { label: 'One-click checkout, emails, and forms', included: false },
    ],
    cta: 'Start browsing',
  },
  {
    id: 'directory',
    name: 'Directory',
    plan: 'directory',
    eyebrow: 'Sourcing',
    tagline: 'Every piece, and the house that holds it.',
    monthly: 29,
    features: [
      { label: 'Everything in Browse', included: true },
      { label: 'Prop house name and link on every piece', included: true },
      { label: 'Pull lists by project, across every house', included: true },
      { label: 'AI search by scene or moodboard', included: false },
      { label: 'One-click checkout, emails, and forms', included: false },
    ],
    cta: 'Start Directory',
  },
  {
    id: 'coordinator',
    name: 'Coordinator',
    plan: 'pro',
    eyebrow: 'Coordinating',
    tagline: 'The emails and the forms, handled.',
    monthly: 100,
    features: [
      { label: 'Everything in Directory', included: true },
      { label: 'AI search by scene, mood, or moodboard', included: true },
      { label: 'One-click checkout across every house in the cart', included: true },
      { label: 'Vendor emails written and sent for you', included: true },
      { label: 'Paperwork filled from your profile. You sign.', included: true },
    ],
    cta: 'Start Coordinator',
    recommended: true,
  },
] as const;

/** Where a tier's CTA goes: sign-in, then the account page with the tier noted. */
export function tierHref(tier: PricingTier): string {
  if (tier.monthly === 0) return '/login';
  return `/login?next=${encodeURIComponent(`/account?plan=${tier.id}`)}`;
}

/** "$29" or "Free". Whole dollars only; the rate card has no cents. */
export function formatMonthly(monthly: number): string {
  return monthly === 0 ? 'Free' : `$${monthly}`;
}

/** The objections a rate card answers, in the order a reader asks them. */
export const PRICING_FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Do I need a plan to search?',
    a: 'No. Browsing is free and does not expire. A plan shows you the houses, and does the work after the search.',
  },
  {
    q: 'Does the prop house pay anything?',
    a: 'No. Vendors receive requests at no charge. You pay for the workflow, never a markup on the rental.',
  },
  {
    q: 'Is the AI search unlimited?',
    a: 'Coordinator includes AI search for day-to-day pulls under a fair-use daily cap. There is no per-search charge.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time. The plan runs to the end of the month you paid for, and your pull lists stay.',
  },
];

/** The rate-card name for a gating tier ("Coordinator" for 'pro'). */
export function tierName(plan: PlanTier): string {
  return PRICING_TIERS.find((t) => t.plan === plan)?.name ?? plan;
}
