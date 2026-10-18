'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ATTRIBUTE_GROUPS,
  categoryHref,
  countSelected,
  toggleFilter,
  type AttributeFacets,
  type AttributeFilters,
  type AttributeKey,
} from '@/lib/category-filters';
import { cn } from '@/lib/utils';

/** Values shown per group before "more" opens the rest. */
const SHOWN = 8;

/**
 * The filter rail on a category page: a retail sidebar in Party Line dress.
 * One ruled block per attribute (Era, Style, Vibes, ...), each value a row
 * with an ink check box, the value, and its count in the category. Every row
 * is a link to the same page with that value toggled, so the server renders
 * the narrowed grid and the URL carries the state. On small screens the rail
 * folds behind a "Filters" tab.
 */
export function CategoryFilters({
  slug,
  query,
  facets,
  selected,
}: {
  slug: string;
  query: string;
  facets: AttributeFacets;
  selected: AttributeFilters;
}) {
  const [open, setOpen] = useState(false);
  const active = countSelected(selected);
  const groups = ATTRIBUTE_GROUPS.map((g) => ({
    ...g,
    values: withSelected(facets[g.key], selected[g.key] ?? []),
  })).filter((g) => g.values.length > 0);

  if (groups.length === 0) return null;

  return (
    <aside aria-label="Filters">
      <div className="flex items-baseline justify-between border-b-[2px] border-ink pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="category-filter-groups"
          className="font-heading text-[13px] font-extrabold uppercase tracking-[0.06em] text-foreground lg:pointer-events-none"
        >
          Filters{' '}
          {active > 0 && <span className="tag ml-1 px-1.5 py-0 text-[11px]">{active}</span>}{' '}
          <span className="ml-1 font-mono text-[11px] font-medium text-text-tertiary lg:hidden">
            {open ? 'Hide' : 'Show'}
          </span>
        </button>
        {active > 0 && (
          <Link
            href={categoryHref(slug, { q: query })}
            scroll={false}
            className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary ink-underline hover:text-foreground"
          >
            Clear all
          </Link>
        )}
      </div>

      <div id="category-filter-groups" className={cn('space-y-6 pt-4', open ? 'block' : 'hidden lg:block')}>
        {groups.map((g) => (
          <FilterGroup
            key={g.key}
            label={g.label}
            groupKey={g.key}
            values={g.values}
            selected={selected[g.key] ?? []}
            href={(value) => categoryHref(slug, { q: query, filters: toggleFilter(selected, g.key, value) })}
          />
        ))}
      </div>
    </aside>
  );
}

/**
 * The facet list in its own (count) order, with any selected value the facets
 * do not list prepended at a zero count. Order never changes with selection:
 * a row the user just clicked stays exactly where it was.
 */
function withSelected(values: Array<{ value: string; n: number }>, selected: string[]) {
  const known = new Set(values.map((v) => v.value));
  const missing = selected.filter((v) => !known.has(v)).map((value) => ({ value, n: 0 }));
  return [...missing, ...values];
}

function FilterGroup({
  label,
  groupKey,
  values,
  selected,
  href,
}: {
  label: string;
  groupKey: AttributeKey;
  values: Array<{ value: string; n: number }>;
  selected: string[];
  href: (value: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  // Folded: the first eight, plus any selected row further down so a choice
  // is never hidden from the user who made it.
  const shown = expanded ? values : values.filter((v, i) => i < SHOWN || selected.includes(v.value));
  const hidden = values.length - shown.length;

  return (
    <section aria-labelledby={`filter-${groupKey}`}>
      <h3
        id={`filter-${groupKey}`}
        className="border-b-[1.5px] border-ink/40 pb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary"
      >
        {label}
      </h3>
      <ul className="mt-2">
        {shown.map((v) => {
          const on = selected.includes(v.value);
          return (
            <li key={v.value}>
              <Link
                href={href(v.value)}
                scroll={false}
                aria-pressed={on}
                aria-label={`${v.value}, ${v.n.toLocaleString()}`}
                className="group flex items-center gap-2.5 py-1 text-[13px] leading-[18px] text-text-secondary hover:text-foreground"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-3.5 shrink-0 border-[1.5px] border-foreground transition-colors duration-150',
                    on ? 'bg-foreground' : 'bg-transparent group-hover:bg-foreground/15',
                  )}
                />
                <span className={cn('min-w-0 flex-1 truncate', on && 'text-foreground')}>{v.value}</span>
                <span className="font-mono text-[11px] text-text-tertiary">{v.n.toLocaleString()}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary ink-underline hover:text-foreground"
        >
          {expanded ? 'Fewer' : `${hidden} more`}
        </button>
      )}
    </section>
  );
}
