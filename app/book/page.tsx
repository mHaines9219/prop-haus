import Link from 'next/link';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { VENDOR_CATEGORY_LIST } from '@/lib/vendor-categories';

export const metadata = {
  title: 'Book — Prop Haus',
  description:
    'Book crew, hair & makeup, styling, lighting & rigging, and catering for your production.',
};

export default function BookPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />

      <main className="flex-1">
        <section>
          <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-16 sm:px-6 md:pt-24">
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              Los Angeles vendors
            </p>
            <h1 className="mt-5 max-w-[640px] font-display text-[40px] font-bold leading-[1.06] tracking-[-0.01em] [text-wrap:balance] md:text-[56px] md:leading-[60px]">
              Every department, one request away.
            </h1>
            <p className="mt-5 max-w-[480px] text-[15px] leading-[23px] text-text-secondary">
              Book vetted production vendors across departments. Request through the
              platform — we coordinate the rest.
            </p>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1600px]">
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
              {VENDOR_CATEGORY_LIST.map((c) => (
                <Link
                  key={c.slug}
                  href={c.href}
                  className="group flex flex-col bg-background p-6 transition-colors duration-150 hover:bg-surface-inset"
                >
                  <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
                    {c.eyebrow}
                  </p>
                  <p className="mt-3 font-display text-[24px] font-bold leading-[30px]">
                    {c.label}
                  </p>
                  <p className="mt-2 max-w-[420px] text-[14px] leading-[21px] text-text-secondary">
                    {c.blurb}
                  </p>
                  <span className="mt-5 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-emerald-400 transition-colors group-hover:text-emerald-300">
                    Browse {c.label} →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
