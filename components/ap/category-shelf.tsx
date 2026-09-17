import Link from 'next/link';
import { Fragment } from 'react';

type Category = { name: string; href: string; count: number };

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function CategoryShelf({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;

  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {categories.map((cat, i) => (
            <Link
              key={cat.name}
              href={cat.href}
              className={`@container group relative flex flex-col justify-between overflow-hidden rounded-md border border-border bg-card p-5 transition-colors duration-200 hover:border-border-strong sm:p-6${i === categories.length - 1 && categories.length % 2 !== 0 ? ' col-span-2' : ''}`}
              style={{ minHeight: 180 }}
            >
              {/* Titles stack at the ampersand: "WALL DECOR" / "& MIRRORS" */}
              <p
                className="font-heading font-bold uppercase tracking-[-0.02em] text-foreground transition-colors duration-200 group-hover:text-accent"
                style={{ fontSize: 'clamp(15px, 12.5cqw, 64px)', lineHeight: 0.98 }}
              >
                {cat.name.split(' & ').map((line, j) => (
                  <Fragment key={line}>
                    {j > 0 && ' '}
                    <span className="block">{j > 0 ? `& ${line}` : line}</span>
                  </Fragment>
                ))}
              </p>

              <p className="mt-6 text-[12px]">
                <span className="font-mono text-accent">{String(i + 1).padStart(2, '0')}</span>
                <span className="ml-2 text-text-tertiary">{fmtCount(cat.count)} items</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
