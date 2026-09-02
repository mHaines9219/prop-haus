'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { CREW_ROLES, contractorHasRole, getCrewRole, type CrewRoleSlug } from '@/lib/crew';
import { ContractorCard, type Contractor } from './contractor-card';

/**
 * Filterable crew list. Filtering happens client-side over the server-fetched
 * roster (the directory is curated and small); the active role is mirrored to
 * `?role=` so a filtered view is linkable. The filter rail follows the
 * browse-grid chip pattern (DESIGN.md 9.3): 32px mono chips, accent border when
 * active, running count in 13px mono.
 */
export function CrewDirectory({
  contractors,
  initialRole = null,
}: {
  contractors: Contractor[];
  initialRole?: CrewRoleSlug | null;
}) {
  const [role, setRole] = useState<CrewRoleSlug | null>(initialRole);
  const reduce = useReducedMotion();

  const visible = role
    ? contractors.filter((c) => contractorHasRole(c.skills, getCrewRole(role)))
    : contractors;

  const counts = Object.fromEntries(
    CREW_ROLES.map((r) => [r.slug, contractors.filter((c) => contractorHasRole(c.skills, r)).length]),
  ) as Record<CrewRoleSlug, number>;

  function select(next: CrewRoleSlug | null) {
    setRole(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('role', next);
    else url.searchParams.delete('role');
    window.history.replaceState(null, '', url);
  }

  const noun = visible.length === 1 ? 'contractor' : 'contractors';

  return (
    <>
      {/* Filter rail */}
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div
            role="group"
            aria-label="Filter crew by role"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          >
            <FilterChip
              label="All crew"
              count={contractors.length}
              selected={role === null}
              onClick={() => select(null)}
            />
            {CREW_ROLES.map((r) => (
              <FilterChip
                key={r.slug}
                label={r.label}
                count={counts[r.slug]}
                selected={role === r.slug}
                onClick={() => select(role === r.slug ? null : r.slug)}
              />
            ))}
          </div>

          <p className="font-mono text-[13px] leading-[18px] text-text-tertiary">
            <span className="font-bold text-foreground">{visible.length}</span> {noun}
            {role ? (
              <>
                , <span className="text-accent">{getCrewRole(role).label}</span>
              </>
            ) : (
              ' available'
            )}
          </p>
        </div>
      </div>

      {/* Grid */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-[1600px]">
          {visible.length === 0 ? (
            <div className="px-4 py-24 text-center sm:px-6">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                No matches
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                {contractors.length === 0
                  ? 'No one available right now — check back soon.'
                  : `No ${role ? getCrewRole(role).label.toLowerCase() : 'crew'} available right now.`}
              </p>
              {role && (
                <button
                  type="button"
                  onClick={() => select(null)}
                  className="mt-5 h-9 rounded-md border border-border px-4 text-sm text-text-secondary transition-colors duration-150 hover:bg-card hover:text-foreground"
                >
                  Show all crew
                </button>
              )}
            </div>
          ) : (
            /* Ruled grid: gap-px over a border-colored parent creates 1px hairline seams.
               Keyed on the role so a filter change re-runs the grid-arrive stagger. */
            <div
              key={role ?? 'all'}
              className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {visible.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 380,
                    damping: 34,
                    delay: Math.min(i, 12) * 0.04,
                  }}
                  className="bg-background"
                >
                  <ContractorCard contractor={c} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3 font-mono text-[12px] transition-colors duration-150',
        selected
          ? 'border-accent text-accent'
          : 'border-border text-text-secondary hover:border-border/70 hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('text-[11px]', selected ? 'text-accent/70' : 'text-text-tertiary')}>
        {count}
      </span>
    </button>
  );
}
