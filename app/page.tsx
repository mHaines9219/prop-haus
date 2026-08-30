import Link from 'next/link';
import { catalogFacets } from '@/lib/catalog-db';
import { HowItWorks } from '@/components/ap/how-it-works';
import { CategoryShelf } from '@/components/ap/category-shelf';
import { HeroSearch } from '@/components/ap/hero-search';
import { SiteFooter } from '@/components/ap/site-footer';
import { SiteNav } from '@/components/ap/site-nav';

// 8 meta-categories + Other. Each entry lists the detailed slugs it rolls up,
// and the slug to link to (the deepest single page until multi-slug browse exists).
const META_CATEGORIES = [
  { name: 'Wall Decor & Mirrors', slugs: ['artwork-wall', 'mirrors-decorative-objects', 'sculptures'], linkTo: 'mirrors-decorative-objects' },
  { name: 'Lighting',             slugs: ['lighting'],                                                  linkTo: 'lighting' },
  { name: 'Signage',              slugs: ['graphics-signage'],                                          linkTo: 'graphics-signage' },
  { name: 'Accessories & Props',  slugs: ['accessories-hand-props', 'floral-plants', 'electronics-tech', 'vehicles-transport', 'sports-recreation', 'medical-anatomical', 'weapons-military', 'rigged-effects'], linkTo: 'accessories-hand-props' },
  { name: 'Kitchen & Tableware',  slugs: ['kitchen-tableware'],                                         linkTo: 'kitchen-tableware' },
  { name: 'Furniture',            slugs: ['seating', 'tables-desks', 'storage-credenzas', 'bars-counters', 'beds-bedroom', 'outdoor-garden', 'office'], linkTo: 'seating' },
  { name: 'Textiles & Rugs',      slugs: ['rugs-floor', 'linens-textiles'],                             linkTo: 'rugs-floor' },
  { name: 'Bed & Bath',           slugs: ['bed-bath'],                                                  linkTo: 'bed-bath' },
  { name: 'Other',                slugs: ['event-essentials', 'industrial-hardware', 'specialized-environments', 'other'], linkTo: 'other' },
] as const;

const SUGGESTIONS = [
  '70s apartment',
  'mid-century office',
  'luxury hotel lobby',
  'art deco speakeasy',
  'victorian drawing room',
];

export default async function HomePage() {
  const facets = await catalogFacets();

  const categories = META_CATEGORIES.map((m) => ({
    name: m.name,
    href: `/category/${m.linkTo}`,
    count: m.slugs.reduce((sum, s) => sum + (facets.categories[s] ?? 0), 0),
  })).filter((c) => c.count > 0);

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <SiteNav />
      <main className="flex-1">
        {/* Hero — law #1: each sentence starts its own line */}
        <section>
          <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-16 sm:px-6 md:pt-[112px]">
            <div className="max-w-[760px]">
              <h1
                className="font-heading font-bold tracking-[-0.032em]"
                style={{
                  fontSize: 'clamp(44px, 6.4vw, 88px)',
                  lineHeight: 'clamp(49px, 7.1vw, 98px)',
                  marginLeft: '-0.04em',
                }}
              >
                <span className="block">Every prop house.</span>
                <span className="block">One pull.</span>
              </h1>

              <p
                className="text-foreground"
                style={{ fontSize: 17, lineHeight: '28px', marginTop: 'calc(1.5 * 28px - 1cap)', maxWidth: '58ch' }}
              >
                Aggregated rental inventory from LA prop houses — every piece searchable in one place.
                Find it, hold it, check out in one click.
              </p>

              <div className="mt-9 max-w-[720px]">
                <HeroSearch />
              </div>

              {/* Suggestion links */}
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
                {SUGGESTIONS.map((s) => (
                  <Link
                    key={s}
                    href={`/search?q=${encodeURIComponent(s)}`}
                    className="text-[13px] leading-[18px] text-text-tertiary underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <HowItWorks />
        <CategoryShelf categories={categories} />
      </main>
      <SiteFooter />
    </div>
  );
}
