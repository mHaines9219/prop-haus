import type { Source } from './types';
import { SOURCE_META } from './types';

export type ScrapeTier = 'easy' | 'medium' | 'hard';
export type CoiStatus = 'unknown' | 'pending' | 'confirmed';

export type Vendor = {
  id: Source;
  name: string;
  city: 'LA';
  website: string;
  tier: ScrapeTier;
  coiStatus: CoiStatus;
  catalogUrl?: string;
  notes?: string;
};

export const VENDORS: Record<Source, Vendor> = {
  gilandroy: { id: 'gilandroy', name: SOURCE_META.gilandroy.name, city: 'LA', website: SOURCE_META.gilandroy.url, tier: 'easy', coiStatus: 'unknown' },
  hpr: { id: 'hpr', name: SOURCE_META.hpr.name, city: 'LA', website: SOURCE_META.hpr.url, tier: 'medium', coiStatus: 'unknown', notes: 'Full-service incl. weapons, fabrication.' },
  platinum: { id: 'platinum', name: SOURCE_META.platinum.name, city: 'LA', website: SOURCE_META.platinum.url, tier: 'easy', coiStatus: 'unknown' },
  omega: { id: 'omega', name: SOURCE_META.omega.name, city: 'LA', website: SOURCE_META.omega.url, tier: 'easy', coiStatus: 'unknown', notes: '245k sqft, ~23 top-level categories.' },
  artdimensions: { id: 'artdimensions', name: SOURCE_META.artdimensions.name, city: 'LA', website: SOURCE_META.artdimensions.url, tier: 'hard', coiStatus: 'unknown', notes: 'Theacme directory listing only — likely manual seed.' },
  ec: { id: 'ec', name: SOURCE_META.ec.name, city: 'LA', website: SOURCE_META.ec.url, tier: 'easy', coiStatus: 'unknown' },
  heritage: { id: 'heritage', name: SOURCE_META.heritage.name, city: 'LA', website: SOURCE_META.heritage.url, tier: 'easy', coiStatus: 'unknown' },
  formdecor: { id: 'formdecor', name: SOURCE_META.formdecor.name, city: 'LA', website: SOURCE_META.formdecor.url, tier: 'easy', coiStatus: 'unknown', notes: 'Furniture-focused; 20th C. designer.' },
  historyforhire: { id: 'historyforhire', name: SOURCE_META.historyforhire.name, city: 'LA', website: SOURCE_META.historyforhire.url, tier: 'hard', coiStatus: 'unknown', notes: '403 on automated fetch; needs browser automation.' },
  propheaven: { id: 'propheaven', name: SOURCE_META.propheaven.name, city: 'LA', website: SOURCE_META.propheaven.url, tier: 'easy', coiStatus: 'unknown' },
  target: { id: 'target', name: SOURCE_META.target.name, city: 'LA', website: SOURCE_META.target.url, tier: 'medium', coiStatus: 'unknown', notes: 'Registration required; futuristic + rigged props.' },
  rcvintage: { id: 'rcvintage', name: SOURCE_META.rcvintage.name, city: 'LA', website: SOURCE_META.rcvintage.url, tier: 'hard', coiStatus: 'unknown', notes: 'Phone/email only; neon specialist.' },
  universal: { id: 'universal', name: SOURCE_META.universal.name, city: 'LA', website: SOURCE_META.universal.url, tier: 'medium', coiStatus: 'unknown', notes: 'Studio-owned.' },
  propserviceswest: { id: 'propserviceswest', name: SOURCE_META.propserviceswest.name, city: 'LA', website: SOURCE_META.propserviceswest.url, tier: 'easy', coiStatus: 'unknown', catalogUrl: 'https://propserviceswest.com/shop/' },
  pina: { id: 'pina', name: SOURCE_META.pina.name, city: 'LA', website: SOURCE_META.pina.url, tier: 'easy', coiStatus: 'unknown' },
  warnerbros: { id: 'warnerbros', name: SOURCE_META.warnerbros.name, city: 'LA', website: SOURCE_META.warnerbros.url, tier: 'hard', coiStatus: 'unknown', notes: 'Login-gated; studio-owned, 60+ categories.' },
  objects: { id: 'objects', name: SOURCE_META.objects.name, city: 'LA', website: SOURCE_META.objects.url, tier: 'easy', coiStatus: 'unknown', notes: 'Curated/design-forward.' },
  alleycats: { id: 'alleycats', name: SOURCE_META.alleycats.name, city: 'LA', website: SOURCE_META.alleycats.url, tier: 'easy', coiStatus: 'unknown' },
  alpha: { id: 'alpha', name: SOURCE_META.alpha.name, city: 'LA', website: SOURCE_META.alpha.url, tier: 'easy', coiStatus: 'unknown' },
  depict33: { id: 'depict33', name: SOURCE_META.depict33.name, city: 'LA', website: SOURCE_META.depict33.url, tier: 'easy', coiStatus: 'unknown' },
  iss: { id: 'iss', name: SOURCE_META.iss.name, city: 'LA', website: SOURCE_META.iss.url, tier: 'medium', coiStatus: 'unknown' },
  premiere: { id: 'premiere', name: SOURCE_META.premiere.name, city: 'LA', website: SOURCE_META.premiere.url, tier: 'easy', coiStatus: 'unknown' },
  shagcarpet: { id: 'shagcarpet', name: SOURCE_META.shagcarpet.name, city: 'LA', website: SOURCE_META.shagcarpet.url, tier: 'easy', coiStatus: 'unknown', notes: 'Multi-era, decade-themed.' },
};

export function vendorRef(id: Source) {
  const v = VENDORS[id];
  return { id, name: v.name, city: 'LA' as const, sourceUrl: v.website };
}
