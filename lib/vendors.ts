import type { Source } from './types';
import { SOURCE_META } from './types';
import type { PassportKind } from './passport';

export type ScrapeTier = 'easy' | 'medium' | 'hard';

export type Vendor = {
  id: Source;
  name: string;
  city: 'LA';
  website: string;
  tier: ScrapeTier;
  /** Where hold requests go. Absent means the ops fallback mailbox gets it. */
  orderEmail?: string;
  catalogUrl?: string;
  notes?: string;
  /**
   * What the house asks a new customer to hand over before a first rental,
   * as passport kinds (lib/passport.ts). The cart asks for whichever of these
   * are not on the passport yet, and the outreach email attaches the ones
   * that are. Absent means only what every house asks for (ASKED_EVERYWHERE).
   */
  asksFor?: PassportKind[];
};

/** Documents every rental house asks a new customer for, whatever else it wants. */
export const ASKED_EVERYWHERE: readonly PassportKind[] = ['coi'];

/** Everything a vendor asks a new customer for, ASKED_EVERYWHERE first, no repeats. */
export function vendorAsksFor(vendor: Pick<Vendor, 'asksFor'>): PassportKind[] {
  return [...new Set([...ASKED_EVERYWHERE, ...(vendor.asksFor ?? [])])];
}

// PLACEHOLDER: confirm every orderEmail with the vendor before MAIL_PROVIDER=resend.
// Each is orders@<vendor domain>, guessed from the website. Art Dimensions has
// no site of its own (a directory listing), so it has no address and its
// requests route to OUTREACH_FALLBACK_TO.
//
// asksFor comes from each house's published policies, scanned Oct 18 2026
// (docs/vendor-requirements-scan.md, with the evidence URL per vendor). A COI
// is asked for everywhere (ASKED_EVERYWHERE). A credit card authorization is
// asked of a first-time, pay-at-pickup customer at the 14 houses below; the
// rest either publish nothing (Heritage, Prop Services West, OBJECTS), take
// the card through a portal (Universal, ISS), or run credit through a studio
// process (Warner Bros., Art Dimensions). Nobody asks for the customer's W-9,
// business license, or resale certificate; photo ID is for students only.
const CARD: PassportKind[] = ['credit_card_authorization'];

export const VENDORS: Record<Source, Vendor> = {
  gilandroy: { id: 'gilandroy', name: SOURCE_META.gilandroy.name, city: 'LA', website: SOURCE_META.gilandroy.url, tier: 'easy', orderEmail: 'orders@gilandroyprops.tv', asksFor: CARD },
  hpr: { id: 'hpr', name: SOURCE_META.hpr.name, city: 'LA', website: SOURCE_META.hpr.url, tier: 'medium', orderEmail: 'orders@hpr.com', notes: 'Full-service incl. weapons, fabrication.', asksFor: CARD },
  platinum: { id: 'platinum', name: SOURCE_META.platinum.name, city: 'LA', website: SOURCE_META.platinum.url, tier: 'easy', orderEmail: 'orders@platinumprophouse.com', asksFor: CARD },
  omega: { id: 'omega', name: SOURCE_META.omega.name, city: 'LA', website: SOURCE_META.omega.url, tier: 'easy', orderEmail: 'orders@omegacinemaprops.com', notes: '245k sqft, ~23 top-level categories.', asksFor: CARD },
  artdimensions: { id: 'artdimensions', name: SOURCE_META.artdimensions.name, city: 'LA', website: SOURCE_META.artdimensions.url, tier: 'hard', notes: 'Theacme directory listing only — likely manual seed.' },
  ec: { id: 'ec', name: SOURCE_META.ec.name, city: 'LA', website: SOURCE_META.ec.url, tier: 'easy', orderEmail: 'orders@ecprops.com', asksFor: CARD },
  heritage: { id: 'heritage', name: SOURCE_META.heritage.name, city: 'LA', website: SOURCE_META.heritage.url, tier: 'easy', orderEmail: 'orders@heritagepropsla.com' },
  historyforhire: { id: 'historyforhire', name: SOURCE_META.historyforhire.name, city: 'LA', website: SOURCE_META.historyforhire.url, tier: 'hard', orderEmail: 'orders@historyforhire.com', notes: '403 on automated fetch; needs browser automation.', asksFor: CARD },
  propheaven: { id: 'propheaven', name: SOURCE_META.propheaven.name, city: 'LA', website: SOURCE_META.propheaven.url, tier: 'easy', orderEmail: 'orders@propheaven.com', asksFor: CARD },
  target: { id: 'target', name: SOURCE_META.target.name, city: 'LA', website: SOURCE_META.target.url, tier: 'medium', orderEmail: 'orders@targetprops.com', notes: 'Registration required; futuristic + rigged props.', asksFor: CARD },
  rcvintage: { id: 'rcvintage', name: SOURCE_META.rcvintage.name, city: 'LA', website: SOURCE_META.rcvintage.url, tier: 'hard', orderEmail: 'orders@rcvintage.com', notes: 'Phone/email only; neon specialist.', asksFor: CARD },
  universal: { id: 'universal', name: SOURCE_META.universal.name, city: 'LA', website: SOURCE_META.universal.url, tier: 'medium', orderEmail: 'orders@props.universalstudios.com', notes: 'Studio-owned.' },
  propserviceswest: { id: 'propserviceswest', name: SOURCE_META.propserviceswest.name, city: 'LA', website: SOURCE_META.propserviceswest.url, tier: 'easy', orderEmail: 'orders@propserviceswest.com', catalogUrl: 'https://propserviceswest.com/shop/' },
  pina: { id: 'pina', name: SOURCE_META.pina.name, city: 'LA', website: SOURCE_META.pina.url, tier: 'easy', orderEmail: 'orders@pinaprops.com', asksFor: CARD },
  warnerbros: { id: 'warnerbros', name: SOURCE_META.warnerbros.name, city: 'LA', website: SOURCE_META.warnerbros.url, tier: 'hard', orderEmail: 'orders@property.warnerbros.com', notes: 'Login-gated; studio-owned, 60+ categories.' },
  objects: { id: 'objects', name: SOURCE_META.objects.name, city: 'LA', website: SOURCE_META.objects.url, tier: 'easy', orderEmail: 'orders@ob-jects.com', notes: 'Curated/design-forward.' },
  alleycats: { id: 'alleycats', name: SOURCE_META.alleycats.name, city: 'LA', website: SOURCE_META.alleycats.url, tier: 'easy', orderEmail: 'orders@alleycatsprops.com', asksFor: CARD },
  alpha: { id: 'alpha', name: SOURCE_META.alpha.name, city: 'LA', website: SOURCE_META.alpha.url, tier: 'easy', orderEmail: 'orders@alphaprops.com', asksFor: CARD },
  depict33: { id: 'depict33', name: SOURCE_META.depict33.name, city: 'LA', website: SOURCE_META.depict33.url, tier: 'easy', orderEmail: 'orders@depict33.com', asksFor: CARD },
  iss: { id: 'iss', name: SOURCE_META.iss.name, city: 'LA', website: SOURCE_META.iss.url, tier: 'medium', orderEmail: 'orders@issprops.com' },
  premiere: { id: 'premiere', name: SOURCE_META.premiere.name, city: 'LA', website: SOURCE_META.premiere.url, tier: 'easy', orderEmail: 'orders@premiereprops.net', asksFor: CARD },
};

export function vendorRef(id: Source) {
  const v = VENDORS[id];
  return { id, name: v.name, city: 'LA' as const, sourceUrl: v.website };
}
