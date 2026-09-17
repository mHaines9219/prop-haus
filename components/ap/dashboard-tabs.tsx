'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Projects', href: '/projects' },
  { label: 'Jobs', href: '/jobs' },
];

/**
 * Sub-nav shared by the dashboard surfaces. /projects and /jobs are one
 * Dashboard to the user — the top nav links here once and these tabs switch
 * between the views.
 */
export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard sections" className="mt-6 flex gap-6 border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 pb-3 font-mono text-[12px] font-medium uppercase tracking-[0.08em] transition-colors duration-150',
              active
                ? 'border-accent text-foreground'
                : 'border-transparent text-text-tertiary hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
