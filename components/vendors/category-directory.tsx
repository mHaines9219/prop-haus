import { createClient } from '@/lib/supabase/server';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { ContractorCard, type Contractor } from './contractor-card';
import type { VendorCategoryConfig } from '@/lib/vendor-categories';

async function getContractors(category: string): Promise<Contractor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('contractors')
    .select('id, name, photo, skills, city, rate_low, rate_high, bio, category')
    .eq('active', true)
    .eq('category', category)
    .order('name');
  return (data as Contractor[]) ?? [];
}

export async function CategoryDirectoryPage({
  category,
  children,
}: {
  category: VendorCategoryConfig;
  children?: React.ReactNode;
}) {
  const contractors = await getContractors(category.db);

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />

      <main className="flex-1">
        {/* Header */}
        <section>
          <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-16 sm:px-6 md:pt-24">
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              {category.eyebrow}
            </p>
            <h1 className="mt-5 max-w-[640px] font-display text-[40px] font-bold leading-[1.06] tracking-[-0.01em] [text-wrap:balance] md:text-[56px] md:leading-[60px]">
              {category.headline}
            </h1>
            <p className="mt-5 max-w-[480px] text-[15px] leading-[23px] text-text-secondary">
              {category.blurb}
            </p>
          </div>
        </section>

        {/* Grid */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1600px]">
            {contractors.length === 0 ? (
              <div className="px-4 py-24 text-center sm:px-6">
                <p className="font-mono text-[13px] text-text-tertiary">
                  No one available right now — check back soon.
                </p>
              </div>
            ) : (
              /* Ruled grid: gap-px over a border-colored parent creates 1px hairline seams */
              <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {contractors.map((c) => (
                  <ContractorCard
                    key={c.id}
                    contractor={c}
                    skillLabels={category.skillLabels}
                    ctaLabel={category.ctaLabel}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {children}

        {/* Footer note */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6">
            <p className="font-mono text-[11px] uppercase leading-[14px] tracking-[0.08em] text-text-disabled">
              {category.footerNote}
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
