import Link from 'next/link';
import { Fragment } from 'react';
import { CategoryDrawing, hasCategoryDrawing } from './category-drawings';

type Category = { name: string; href: string; count: number };

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/**
 * The classified column (DESIGN.md §9.2): one ad box per category. A line
 * drawing of the department (or a big red condensed headline when there is
 * none), the listing number and name bottom-left, the count bottom-right as
 * a coral tag: the ad's phone number.
 */
export function CategoryShelf({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;

  return (
    <section>
      <div className="mx-auto w-full max-w-[1400px] px-3 pb-10 sm:px-5 sm:pb-14">
        <p className="mb-3 flex items-center gap-2.5 font-heading text-[11px] font-extrabold uppercase tracking-[0.14em] text-paper/80">
          <span aria-hidden className="inline-block h-[3px] w-6 bg-coral" />
          Classified by department
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {categories.map((cat, i) => (
            <Link
              key={cat.name}
              href={cat.href}
              className={`@container sheet group relative flex flex-col justify-between overflow-hidden border-[1.5px] border-ink bg-card p-4 text-foreground transition-[box-shadow,transform] duration-150 ease-attend hover:shadow-[3px_3px_0_var(--ink)] motion-safe:hover:-translate-x-px motion-safe:hover:-translate-y-px sm:p-5${i === categories.length - 1 && categories.length % 2 !== 0 ? ' col-span-2 lg:col-span-1' : ''}`}
              style={{ minHeight: 168 }}
            >
              {hasCategoryDrawing(cat.name) ? (
                <CategoryDrawing name={cat.name} className="mx-auto w-full max-w-[300px] text-ink" />
              ) : (
                <p
                  className="ad-headline"
                  style={{ fontSize: 'clamp(22px, 13cqw, 60px)', lineHeight: 0.92 }}
                >
                  {cat.name.split(' & ').map((line, j) => (
                    <Fragment key={line}>
                      {j > 0 && ' '}
                      <span className="block">{j > 0 ? `& ${line}` : line}</span>
                    </Fragment>
                  ))}
                </p>
              )}

              <div className="mt-6 flex items-end justify-between gap-3">
                <span className="font-heading text-[12px] font-bold uppercase tracking-[0.06em] text-foreground/60">
                  {String(i + 1).padStart(2, '0')}
                  {hasCategoryDrawing(cat.name) && <span className="text-accent-text"> · {cat.name}</span>}
                </span>
                <span className="tag">{fmtCount(cat.count)} items</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
