// Vendor booking categories (FUT-1). Each maps to contractors.category in the
// database. Directory pages render from this config; adding a category is a
// new entry here plus seed rows — no schema change.

export type VendorCategoryConfig = {
  slug: string; // URL segment
  db: string; // contractors.category value
  label: string;
  href: string;
  eyebrow: string;
  headline: string;
  blurb: string;
  ctaLabel: string;
  skillLabels: Record<string, string>;
  footerNote: string;
};

export const VENDOR_CATEGORIES: Record<string, VendorCategoryConfig> = {
  crew: {
    slug: 'crew',
    db: 'crew',
    label: 'Crew',
    href: '/crew',
    eyebrow: 'Los Angeles crew',
    headline: 'Extra hands, on call.',
    blurb:
      'Hire vetted crew for delivery runs, load-in and load-out, set dressing, and general production assistance. Request through the platform — we coordinate the rest.',
    ctaLabel: 'Request crew',
    skillLabels: {
      delivery: 'Delivery',
      'set-hands': 'Set hands',
      'load-in': 'Load-in',
      'load-out': 'Load-out',
      'set-dressing': 'Set dressing',
      general: 'General',
    },
    footerNote:
      'All contractors are vetted by Prop Haus. Day rates shown are typical ranges; final rates confirmed on booking.',
  },

  'hair-makeup': {
    slug: 'hair-makeup',
    db: 'hair-makeup',
    label: 'Hair & Makeup',
    href: '/book/hair-makeup',
    eyebrow: 'Los Angeles hair & makeup',
    headline: 'Camera-ready, every take.',
    blurb:
      'Book makeup artists, hair stylists, and full HMU teams for commercial, editorial, and film work. Request through the platform — we coordinate the rest.',
    ctaLabel: 'Request artist',
    skillLabels: {
      makeup: 'Makeup',
      hair: 'Hair',
      sfx: 'SFX',
      grooming: 'Grooming',
      'hmu-team': 'HMU team',
    },
    footerNote:
      'All artists are vetted by Prop Haus. Day rates shown are typical ranges; final rates confirmed on booking. Kit fees quoted per production.',
  },

  styling: {
    slug: 'styling',
    db: 'styling',
    label: 'Styling',
    href: '/book/styling',
    eyebrow: 'Los Angeles styling',
    headline: 'Every frame, dressed.',
    blurb:
      'Book wardrobe stylists, set stylists, and food stylists for commercial, editorial, and e-comm work. Request through the platform — we coordinate the rest.',
    ctaLabel: 'Request stylist',
    skillLabels: {
      wardrobe: 'Wardrobe',
      'set-styling': 'Set styling',
      'food-styling': 'Food styling',
      tailoring: 'Tailoring',
    },
    footerNote:
      'All stylists are vetted by Prop Haus. Day rates shown are typical ranges; final rates confirmed on booking. Pull budgets quoted per production.',
  },

  'lighting-rigging': {
    slug: 'lighting-rigging',
    db: 'lighting-rigging',
    label: 'Lighting & Rigging',
    href: '/book/lighting-rigging',
    eyebrow: 'Los Angeles lighting & rigging',
    headline: 'Grip and electric, covered.',
    blurb:
      'Book gaffers, grips, and rigging techs for stage and location work. Request through the platform — we coordinate the rest.',
    ctaLabel: 'Request tech',
    skillLabels: {
      gaffer: 'Gaffer',
      grip: 'Grip',
      rigging: 'Rigging',
      'lighting-tech': 'Lighting tech',
      'board-op': 'Board op',
    },
    footerNote:
      'All techs are vetted by Prop Haus. Day rates shown are typical ranges; final rates confirmed on booking. Equipment packages quoted separately.',
  },

  catering: {
    slug: 'catering',
    db: 'catering',
    label: 'Catering',
    href: '/book/catering',
    eyebrow: 'Los Angeles catering',
    headline: 'Set fed, on schedule.',
    blurb:
      'Craft services and full catering from partner vendors who know production schedules. Request through the platform — we coordinate the rest.',
    ctaLabel: 'Request catering',
    skillLabels: {
      'craft-services': 'Craft services',
      'full-catering': 'Full catering',
      'coffee-cart': 'Coffee cart',
      dietary: 'Dietary accommodations',
    },
    footerNote:
      'All partner vendors are vetted by Prop Haus. Pricing is quoted per head count and menu; final quotes confirmed on booking.',
  },
};

export const VENDOR_CATEGORY_LIST = Object.values(VENDOR_CATEGORIES);
