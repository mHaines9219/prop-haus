import type { Source } from './types';
import { SOURCE_META, SOURCES } from './types';

export type Endorsement = 'waiver-of-subrogation' | 'primary-non-contributory' | 'blanket-additional-insured';

export type CoiRequirements = {
  required: boolean;
  generalLiability: { perOccurrence: number; aggregate: number };
  autoLiability?: number;
  endorsements: Endorsement[];
  certificateHolder: { name: string; address: string };
  additionalInsuredWording?: string;
  leadTimeDays: number;
  notes?: string;
};

// Standard LA film/TV prop-house defaults. Override per-vendor as we confirm requirements.
const DEFAULT_LA_COI: Omit<CoiRequirements, 'certificateHolder' | 'additionalInsuredWording'> = {
  required: true,
  generalLiability: { perOccurrence: 1_000_000, aggregate: 2_000_000 },
  autoLiability: 1_000_000,
  endorsements: ['waiver-of-subrogation', 'primary-non-contributory', 'blanket-additional-insured'],
  leadTimeDays: 3,
  notes: 'Placeholder — confirm with vendor before delivering to production.',
};

function defaultEntry(source: Source): CoiRequirements {
  const meta = SOURCE_META[source];
  return {
    ...DEFAULT_LA_COI,
    certificateHolder: { name: meta.name, address: 'Los Angeles, CA (address TBD)' },
    additionalInsuredWording: `${meta.name}, its officers, directors, and employees`,
  };
}

export const VENDOR_COI: Record<Source, CoiRequirements> = Object.fromEntries(
  SOURCES.map((s) => [s, defaultEntry(s)]),
) as Record<Source, CoiRequirements>;

export const ENDORSEMENT_LABEL: Record<Endorsement, string> = {
  'waiver-of-subrogation': 'Waiver of subrogation',
  'primary-non-contributory': 'Primary & non-contributory',
  'blanket-additional-insured': 'Blanket additional insured',
};
