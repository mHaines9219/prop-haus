import type { Source } from './types';
import { SOURCE_META } from './types';

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
};

// PLACEHOLDER: confirm every orderEmail with the vendor before MAIL_PROVIDER=resend.
// Each is orders@<vendor domain>, guessed from the website. Art Dimensions has
// no site of its own (a directory listing), so it has no address and its
// requests route to OUTREACH_FALLBACK_TO.
export const VENDORS: Record<Source, Vendor> = {
  gilandroy: { id: 'gilandroy', name: SOURCE_META.gilandroy.name, city: 'LA', website: SOURCE_META.gilandroy.url, tier: 'easy', orderEmail: 'orders@gilandroyprops.tv' },
  hpr: { id: 'hpr', name: SOURCE_META.hpr.name, city: 'LA', website: SOURCE_META.hpr.url, tier: 'medium', orderEmail: 'orders@hpr.com', notes: 'Full-service incl. weapons, fabrication.' },
  platinum: { id: 'platinum', name: SOURCE_META.platinum.name, city: 'LA', website: SOURCE_META.platinum.url, tier: 'easy', orderEmail: 'orders@platinumprophouse.com' },
  omega: { id: 'omega', name: SOURCE_META.omega.name, city: 'LA', website: SOURCE_META.omega.url, tier: 'easy', orderEmail: 'orders@omegacinemaprops.com', notes: '245k sqft, ~23 top-level categories.' },
  artdimensions: { id: 'artdimensions', name: SOURCE_META.artdimensions.name, city: 'LA', website: SOURCE_META.artdimensions.url, tier: 'hard', notes: 'Theacme directory listing only — likely manual seed.' },
  ec: { id: 'ec', name: SOURCE_META.ec.name, city: 'LA', website: SOURCE_META.ec.url, tier: 'easy', orderEmail: 'orders@ecprops.com' },
  heritage: { id: 'heritage', name: SOURCE_META.heritage.name, city: 'LA', website: SOURCE_META.heritage.url, tier: 'easy', orderEmail: 'orders@heritagepropsla.com' },
  historyforhire: { id: 'historyforhire', name: SOURCE_META.historyforhire.name, city: 'LA', website: SOURCE_META.historyforhire.url, tier: 'hard', orderEmail: 'orders@historyforhire.com', notes: '403 on automated fetch; needs browser automation.' },
  propheaven: { id: 'propheaven', name: SOURCE_META.propheaven.name, city: 'LA', website: SOURCE_META.propheaven.url, tier: 'easy', orderEmail: 'orders@propheaven.com' },
  target: { id: 'target', name: SOURCE_META.target.name, city: 'LA', website: SOURCE_META.target.url, tier: 'medium', orderEmail: 'orders@targetprops.com', notes: 'Registration required; futuristic + rigged props.' },
  rcvintage: { id: 'rcvintage', name: SOURCE_META.rcvintage.name, city: 'LA', website: SOURCE_META.rcvintage.url, tier: 'hard', orderEmail: 'orders@rcvintage.com', notes: 'Phone/email only; neon specialist.' },
  universal: { id: 'universal', name: SOURCE_META.universal.name, city: 'LA', website: SOURCE_META.universal.url, tier: 'medium', orderEmail: 'orders@props.universalstudios.com', notes: 'Studio-owned.' },
  propserviceswest: { id: 'propserviceswest', name: SOURCE_META.propserviceswest.name, city: 'LA', website: SOURCE_META.propserviceswest.url, tier: 'easy', orderEmail: 'orders@propserviceswest.com', catalogUrl: 'https://propserviceswest.com/shop/' },
  pina: { id: 'pina', name: SOURCE_META.pina.name, city: 'LA', website: SOURCE_META.pina.url, tier: 'easy', orderEmail: 'orders@pinaprops.com' },
  warnerbros: { id: 'warnerbros', name: SOURCE_META.warnerbros.name, city: 'LA', website: SOURCE_META.warnerbros.url, tier: 'hard', orderEmail: 'orders@property.warnerbros.com', notes: 'Login-gated; studio-owned, 60+ categories.' },
  objects: { id: 'objects', name: SOURCE_META.objects.name, city: 'LA', website: SOURCE_META.objects.url, tier: 'easy', orderEmail: 'orders@ob-jects.com', notes: 'Curated/design-forward.' },
  alleycats: { id: 'alleycats', name: SOURCE_META.alleycats.name, city: 'LA', website: SOURCE_META.alleycats.url, tier: 'easy', orderEmail: 'orders@alleycatsprops.com' },
  alpha: { id: 'alpha', name: SOURCE_META.alpha.name, city: 'LA', website: SOURCE_META.alpha.url, tier: 'easy', orderEmail: 'orders@alphaprops.com' },
  depict33: { id: 'depict33', name: SOURCE_META.depict33.name, city: 'LA', website: SOURCE_META.depict33.url, tier: 'easy', orderEmail: 'orders@depict33.com' },
  iss: { id: 'iss', name: SOURCE_META.iss.name, city: 'LA', website: SOURCE_META.iss.url, tier: 'medium', orderEmail: 'orders@issprops.com' },
  premiere: { id: 'premiere', name: SOURCE_META.premiere.name, city: 'LA', website: SOURCE_META.premiere.url, tier: 'easy', orderEmail: 'orders@premiereprops.net' },
};

export function vendorRef(id: Source) {
  const v = VENDORS[id];
  return { id, name: v.name, city: 'LA' as const, sourceUrl: v.website };
}
