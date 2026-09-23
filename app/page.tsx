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

function fmtBig(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

export default async function HomePage() {
  const facets = await catalogFacets();

  const categories = META_CATEGORIES.map((m) => ({
    name: m.name,
    href: `/category/${m.linkTo}`,
    count: m.slugs.reduce((sum, s) => sum + (facets.categories[s] ?? 0), 0),
  })).filter((c) => c.count > 0);

  const houses = Object.keys(facets.vendors ?? {}).length;

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <SiteNav />
      <main className="flex-1">
        {/* The big ad (DESIGN.md §9.2): the page's one full-width listing */}
        <section>
          <div className="mx-auto w-full max-w-[1400px] px-3 pt-3 sm:px-5 sm:pt-5">
            <div className="sheet border-[1.5px] border-ink bg-card text-foreground shadow-[4px_4px_0_rgba(0,0,0,0.3)]">
              <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10 lg:p-10">
                {/* Copy */}
                <div className="min-w-0">
                  <p className="listing">
                    <span>Props</span>
                    <span>Set dressing</span>
                    <span>Crew</span>
                    <span>Paperwork</span>
                  </p>

                  <h1
                    className="font-display mt-4 font-bold text-foreground"
                    style={{
                      fontSize: 'clamp(42px, 6vw, 82px)',
                      lineHeight: 0.98,
                      letterSpacing: '-0.015em',
                    }}
                  >
                    <span className="block">Every prop house.</span>
                    <span className="block">One pull.</span>
                  </h1>

                  <p className="mt-4 font-sans text-[15px] font-bold italic leading-[20px] text-accent-text sm:text-[16px]">
                    Working to keep your production dressed.
                  </p>

                  <p
                    className="mt-4 max-w-[54ch] text-[15px] leading-[23px] text-text-secondary"
                  >
                    Aggregated rental inventory from LA prop houses, every piece searchable in one
                    place. Find it, hold it, check out in one click.
                  </p>

                  <div className="mt-7 max-w-[720px]">
                    <HeroSearch />
                  </div>

                  {/* Suggestion links: a listing line of what people ask for */}
                  <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                    <span className="font-heading text-[10px] font-extrabold uppercase tracking-[0.12em] text-text-tertiary">
                      Try
                    </span>
                    {SUGGESTIONS.map((s) => (
                      <Link
                        key={s}
                        href={`/search?q=${encodeURIComponent(s)}`}
                        className="text-[13px] leading-[18px] text-text-secondary underline decoration-accent-text/60 decoration-[1.5px] underline-offset-[4px] transition-colors duration-150 hover:text-accent-text hover:decoration-accent-text"
                      >
                        {s}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* The line drawing */}
                <div className="hidden min-w-0 items-center justify-center lg:flex">
                  <LineDrawing className="w-full max-w-[460px] text-ink" />
                </div>
              </div>

              {/* Bottom line: the two phone numbers of the ad */}
              <div className="grid grid-cols-2 border-t-2 border-ink">
                <div className="px-5 py-4 sm:px-8 lg:px-10">
                  <p className="font-mono text-[26px] font-extrabold leading-none tracking-[-0.01em] text-foreground sm:text-[32px]">
                    {fmtBig(facets.total)}
                  </p>
                  <p className="mt-1.5 font-heading text-[11px] font-extrabold uppercase leading-[14px] tracking-[0.08em] text-accent-text">
                    Pieces in the catalog
                  </p>
                </div>
                <div className="border-l-2 border-ink px-5 py-4 text-right sm:px-8 lg:px-10">
                  <p className="font-mono text-[26px] font-extrabold leading-none tracking-[-0.01em] text-foreground sm:text-[32px]">
                    {houses > 0 ? houses : '—'}
                  </p>
                  <p className="mt-1.5 font-heading text-[11px] font-extrabold uppercase leading-[14px] tracking-[0.08em] text-accent-text">
                    Prop houses · Los Angeles
                  </p>
                </div>
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

/**
 * The ad's line drawing: an armchair, a floor lamp, a side table with a
 * plant, a picture on the wall. Ink strokes only, the way the bank and the
 * tractor are drawn in the reference. Decorative; hidden from readers.
 */
function LineDrawing({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 300"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* floor line + hatch */}
      <path d="M12 262 H408" />
      <path d="M30 262 l-8 10 M60 262 l-8 10 M90 262 l-8 10 M120 262 l-8 10 M150 262 l-8 10 M180 262 l-8 10 M210 262 l-8 10 M240 262 l-8 10 M270 262 l-8 10 M300 262 l-8 10 M330 262 l-8 10 M360 262 l-8 10 M390 262 l-8 10" strokeWidth="1.25" />

      {/* picture on the wall */}
      <rect x="250" y="36" width="118" height="84" />
      <rect x="258" y="44" width="102" height="68" strokeWidth="1.25" />
      <path d="M268 100 l24 -28 l18 20 l14 -14 l26 22" strokeWidth="1.5" />
      <circle cx="338" cy="60" r="6" strokeWidth="1.5" />

      {/* armchair */}
      <path d="M62 262 V150 q0 -14 14 -14 h14" />
      <path d="M90 136 h96 q14 0 14 14 v26" />
      <path d="M76 176 h22 q10 0 10 10 v40 h96 v-40 q0 -10 10 -10 h22" />
      <path d="M48 176 q-10 0 -10 10 v46 h30 v-40 q0 -16 -20 -16 z" />
      <path d="M236 176 q10 0 10 10 v46 h-30 v-40 q0 -16 20 -16 z" />
      <path d="M68 232 h148" />
      <path d="M108 190 h68 v36 h-68 z" strokeWidth="1.5" />
      <path d="M118 198 q18 -6 36 0 q-18 6 -36 0" strokeWidth="1.25" />
      <path d="M52 262 v-10 M232 262 v-10" />
      {/* cushion tuft lines */}
      <path d="M100 150 v20 M140 148 v22 M180 150 v20" strokeWidth="1.25" />

      {/* floor lamp */}
      <path d="M312 262 h44" />
      <path d="M334 262 V132" />
      <path d="M302 132 h64 l-10 -44 h-44 z" />
      <path d="M312 118 h44 M308 104 h52" strokeWidth="1.25" />

      {/* side table with plant */}
      <path d="M262 262 v-58 h-4 v58 M296 262 v-58 h-4 v58" strokeWidth="1.5" />
      <path d="M252 204 h50" />
      <path d="M266 204 v-18 h22 v18" strokeWidth="1.5" />
      <path d="M277 186 q-14 -18 -8 -34 q8 10 8 34 z" strokeWidth="1.5" />
      <path d="M277 186 q12 -20 4 -36 q-8 12 -4 36 z" strokeWidth="1.5" />
      <path d="M277 186 q-20 -10 -24 -26 q16 2 24 26 z" strokeWidth="1.5" />

      {/* rug */}
      <path d="M40 262 q100 -12 200 0" strokeWidth="1.25" />
      <path d="M44 268 q96 -10 192 0" strokeWidth="1.25" />
    </svg>
  );
}
