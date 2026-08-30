import { createClient } from '@/lib/supabase/server';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { ContractorCard, type Contractor } from './contractor-card';

export const metadata = {
  title: 'Crew — Prop Haus',
  description: 'Hire extra hands for set, delivery runs, load-in and load-out.',
};

async function getContractors(): Promise<Contractor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('contractors')
    .select('id, name, photo, skills, city, rate_low, rate_high, bio, category')
    .eq('active', true)
    .order('name');
  return (data as Contractor[]) ?? [];
}

export default async function CrewPage() {
  const contractors = await getContractors();

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />

      <main className="flex-1">
        {/* Header */}
        <section>
          <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-16 sm:px-6 md:pt-24">
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              Los Angeles crew
            </p>
            <h1 className="mt-5 max-w-[640px] font-display text-[40px] font-bold leading-[1.06] tracking-[-0.01em] [text-wrap:balance] md:text-[56px] md:leading-[60px]">
              Extra hands, on call.
            </h1>
            <p className="mt-5 max-w-[480px] text-[15px] leading-[23px] text-text-secondary">
              Hire vetted crew for delivery runs, load-in and load-out, set dressing, and
              general production assistance. Request through the platform — we coordinate the
              rest.
            </p>
          </div>
        </section>

        {/* Grid */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1600px]">
            {contractors.length === 0 ? (
              <div className="px-4 py-24 text-center sm:px-6">
                <p className="font-mono text-[13px] text-text-tertiary">
                  No contractors available right now — check back soon.
                </p>
              </div>
            ) : (
              /* Ruled grid: gap-px over a border-colored parent creates 1px hairline seams */
              <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {contractors.map((c) => (
                  <ContractorCard key={c.id} contractor={c} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Footer note */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6">
            <p className="font-mono text-[11px] uppercase leading-[14px] tracking-[0.08em] text-text-disabled">
              All contractors are vetted by Prop Haus. Day rates shown are typical ranges;
              final rates confirmed on booking.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
