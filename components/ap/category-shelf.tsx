'use client';

import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, type MouseEvent } from 'react';
import { CategoryDrawing, hasCategoryDrawing } from './category-drawings';

type Category = { name: string; href: string; count: number };

/**
 * How long the click's stamp plays before the page turns. Matches the
 * `drawing-stamp` keyframes in app/globals.css.
 */
export const STAMP_MS = 420;

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** A plain primary click: the only kind we intercept. Modified clicks open tabs as usual. */
function isPlainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}

/**
 * The classified column (DESIGN.md §9.2): one ad box per category. A line
 * drawing of the department (or a big red condensed headline when there is
 * none), the listing number and name bottom-left, the count bottom-right as
 * a coral tag: the ad's phone number.
 *
 * The drawing dances on hover and stamps on click (keyframes in
 * app/globals.css, "category drawing"). The stamp is the one place we hold
 * a navigation: the click plays the stamp, then pushes the route. Reduced
 * motion, modified clicks, and headline-only tiles navigate at once.
 */
export function CategoryShelf({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;

  return (
    <section>
      <div className="mx-auto w-full max-w-[1400px] px-3 pb-10 sm:px-5 sm:pb-14">
        <p className="mb-3 flex items-center gap-2.5 font-heading text-[11px] font-extrabold uppercase tracking-[0.14em] text-binder-foreground/80">
          <span aria-hidden className="inline-block h-[3px] w-6 bg-coral" />
          Classified by department
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {categories.map((cat, i) => (
            <CategoryAd
              key={cat.name}
              category={cat}
              ordinal={i + 1}
              stretch={i === categories.length - 1 && categories.length % 2 !== 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryAd({
  category: cat,
  ordinal,
  stretch,
}: {
  category: Category;
  ordinal: number;
  stretch: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const drawn = hasCategoryDrawing(cat.name);
  const [stamping, setStamping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!drawn || reduce || stamping || !isPlainClick(e)) return;
    e.preventDefault();
    setStamping(true);
    timer.current = setTimeout(() => router.push(cat.href), STAMP_MS);
  }

  return (
    <Link
      href={cat.href}
      onClick={onClick}
      data-stamping={stamping ? '' : undefined}
      className={`@container sheet category-ad group relative flex flex-col justify-between overflow-hidden border-[1.5px] border-ink bg-card p-4 text-foreground transition-[box-shadow,translate] duration-150 ease-attend hover:shadow-[3px_3px_0_var(--ink)] motion-safe:hover:-translate-x-px motion-safe:hover:-translate-y-px data-[stamping]:hover:translate-x-0 data-[stamping]:hover:translate-y-0 data-[stamping]:hover:shadow-none sm:p-5${stretch ? ' col-span-2 lg:col-span-1' : ''}`}
      style={{ minHeight: 168 }}
    >
      {drawn ? (
        <CategoryDrawing name={cat.name} className="mx-auto w-full max-w-[300px] text-ink" />
      ) : (
        <p className="ad-headline" style={{ fontSize: 'clamp(22px, 13cqw, 60px)', lineHeight: 0.92 }}>
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
          {String(ordinal).padStart(2, '0')}
          {drawn && <span className="text-accent-text"> · {cat.name}</span>}
        </span>
        <span className="tag">{fmtCount(cat.count)} items</span>
      </div>
    </Link>
  );
}
