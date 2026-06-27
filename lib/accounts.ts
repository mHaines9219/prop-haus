/**
 * Account model: organizations, user profiles, memberships, and per-vendor relationships.
 *
 * Design notes (so this survives the eventual move to Postgres with few/no migrations):
 *  - Auth (email, password, Google/login-method, sessions) is owned by the auth provider
 *    (e.g. Supabase `auth.users` / `auth.identities`). We NEVER store a password here.
 *    `Profile.id` equals the auth user id; `email` is mirrored only for convenient joins.
 *  - Every user belongs to exactly one organization. A freelancer is an org of
 *    type 'personal' with a single 'owner' membership — same code path as a company.
 *  - Vendor relationships are ROWS (OrgVendorAccount), never a column per vendor, so
 *    onboarding a new vendor requires no schema change.
 *  - Enums below are stored as TEXT (validated in app code), not native DB enums, so
 *    adding a value is not a type migration. Each entity has a `metadata` jsonb escape
 *    hatch for soft attributes you can add without DDL.
 *  - This Organization supersedes the client-only BusinessProfile in lib/profile-store.ts
 *    and the BusinessProfile type in lib/insurance.ts (its policy becomes `org.insurance`).
 */
import type { Source } from './types';
import type { InsurancePolicy } from './insurance';

// ---------- enums (text in DB; validate against these in app code) ----------

export const ORG_TYPES = ['personal', 'company'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

/** Permission role within an org — NOT the user's profession. */
export const MEMBERSHIP_ROLES = ['owner', 'admin', 'member'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Profession / job title (the "role" collected at onboarding). */
export const PROFESSIONS = [
  'set_decorator',
  'production_designer',
  'art_director',
  'prop_master',
  'producer',
  'stylist',
  'event_producer',
  'experiential_producer',
  'other',
] as const;
export type Profession = (typeof PROFESSIONS)[number];

export const HEARD_ABOUT_US = [
  'referral',
  'word_of_mouth',
  'social',
  'search',
  'event',
  'press',
  'other',
] as const;
export type HeardAboutUs = (typeof HEARD_ABOUT_US)[number];

export const VENDOR_ACCOUNT_STATUSES = ['claimed', 'verified', 'rejected'] as const;
/** 'claimed' = org self-reported; 'verified' = platform-confirmed with the vendor. */
export type VendorAccountStatus = (typeof VENDOR_ACCOUNT_STATUSES)[number];

/** Billing/gating tier. Which features each tier unlocks is defined in lib/plans.ts (code, not DB). */
export const PLAN_TIERS = ['free', 'pro'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

// --- progressive-profiling enums (optional firmographics, for segmentation/upsell) ---

export const PRODUCTION_TYPES = [
  'film',
  'television',
  'commercial',
  'music_video',
  'editorial',
  'event',
  'experiential',
  'theater',
  'other',
] as const;
export type ProductionType = (typeof PRODUCTION_TYPES)[number];

export const PROJECT_VOLUME_BANDS = ['1-5', '6-20', '21-50', '50+'] as const;
export type ProjectVolumeBand = (typeof PROJECT_VOLUME_BANDS)[number];

export const BUDGET_BANDS = ['under_5k', '5k_25k', '25k_100k', '100k_plus'] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

// ---------- entities (one type per future DB table) ----------

export type Contact = { name: string; email: string; phone?: string };

export type Organization = {
  id: string;
  type: OrgType; // 'personal' = freelancer org-of-one; 'company' = team
  name: string; // business name; for freelancers, defaults to the user's own name
  plan: PlanTier; // gating tier; entitlements resolved in lib/plans.ts (defaults to 'free')
  address?: string;
  contact?: Contact;
  insurance?: InsurancePolicy; // replaces the client-only BusinessProfile.policy
  // --- progressive profiling: optional, capture AFTER signup — never gate entry on these ---
  productionTypes?: ProductionType[];
  markets?: string[]; // city slugs, e.g. ['LA']
  annualProjectVolume?: ProjectVolumeBand;
  typicalBudgetBand?: BudgetBand;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type Profile = {
  id: string; // == auth user id (Supabase auth.users.id). No password stored here.
  orgId: string; // every user has exactly one org (personal or company)
  email: string; // mirrored from auth for convenient joins
  fullName?: string; // from the auth provider (e.g. Google) at signup
  profession?: Profession; // set during onboarding, not at auth signup
  heardAboutUs?: HeardAboutUs;
  heardAboutUsDetail?: string; // free text, esp. when heardAboutUs === 'other'/'referral'
  onboardedAt?: string; // null until the onboarding form is completed
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type Membership = {
  orgId: string;
  userId: string;
  role: MembershipRole; // permission role
  createdAt: string;
  // (orgId, userId) is the composite primary key
};

export type OrgVendorAccount = {
  id: string;
  orgId: string;
  vendor: Source; // slug validated against SOURCES — not a DB enum
  status: VendorAccountStatus;
  accountRef?: string; // the org's account # / login email with that vendor
  coiOnFile: boolean; // hook into the COI flow: skip re-collection when true
  verifiedAt?: string;
  verifiedBy?: 'org_claimed' | 'platform_confirmed';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  // unique (orgId, vendor)
};

// ---------- onboarding input (what the signup form collects post-auth) ----------

export type OnboardingInput = {
  userId: string; // from the auth provider
  email: string; // from the auth provider
  fullName: string;
  profession: Profession;
  orgType: OrgType; // 'personal' for freelancers
  businessName?: string; // required when orgType === 'company'
  heardAboutUs?: HeardAboutUs;
  heardAboutUsDetail?: string;
};
