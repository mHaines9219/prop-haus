'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { categoryHref, type AttributeFilters } from '@/lib/category-filters';
import { cn } from '@/lib/utils';

/**
 * The search bar on a category page: the hero bar cut down to its listing
 * box, scoped to ONE category. A submit navigates to the same page with `?q=`
 * (keeping whatever the filter rail has selected), so the server renders the
 * matches, the URL is shareable and the back button returns to the browse
 * grid. The hint line says what it searches and offers the whole catalogue as
 * the way out.
 */
export function CategorySearch({
  slug,
  name,
  initialQuery = '',
  filters = {},
}: {
  slug: string;
  name: string;
  initialQuery?: string;
  /** Rail selections to carry along with the query. */
  filters?: AttributeFilters;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const active = initialQuery.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(categoryHref(slug, { q, filters }));
  }

  return (
    <form onSubmit={handleSubmit} role="search" aria-label={`Search ${name}`}>
      <div
        data-slot="search-bar"
        className={cn(
          'flex items-stretch border-[2px] bg-input transition-colors duration-150',
          focused ? 'border-accent' : 'border-ink',
        )}
        style={{ minHeight: 48 }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 pr-2 sm:gap-3 sm:pl-4 sm:pr-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className="shrink-0 text-foreground/70">
            <circle cx="7" cy="7" r="4.75" />
            <path d="M10.5 10.5 L14 14" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label={`Search ${name}`}
            placeholder={`Search ${name}`}
            className="h-full min-w-0 flex-1 bg-transparent py-3 text-[15px] text-foreground outline-none placeholder:text-foreground/50"
          />
        </div>

        <div className="flex shrink-0 items-stretch">
          {active && (
            <Link
              href={categoryHref(slug, { filters })}
              className="flex items-center border-l-[1.5px] border-ink/40 px-3 font-heading text-[12px] font-extrabold uppercase tracking-[0.06em] text-foreground/70 transition-colors duration-150 hover:bg-paper-deep hover:text-foreground"
            >
              Clear
            </Link>
          )}
          <button
            type="submit"
            className="search-go flex items-center border-l-[2px] border-ink bg-accent px-3 font-heading text-[13px] font-extrabold uppercase tracking-[0.06em] text-accent-foreground transition-colors duration-150 hover:bg-primary-hover sm:px-5"
          >
            Search
          </button>
        </div>
      </div>

      <p className="listing mt-3">
        <span>Searches {name} only</span>
        <span>
          <Link
            href={active ? `/search?q=${encodeURIComponent(initialQuery.trim())}` : '/search'}
            className="ink-underline hover:text-foreground"
          >
            Search the whole catalogue
          </Link>
        </span>
      </p>
    </form>
  );
}
