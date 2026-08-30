import { cn } from '@/lib/utils';
import { SiteFooter } from './site-footer';
import { SiteNav } from './site-nav';

/**
 * Standard Answer Print page frame: the velvet-black canvas, the 56px nav, and
 * the footer credit. Every page renders its own chrome through this shared
 * shell. The home page keeps its own bespoke layout; everything else composes
 * this.
 */
export function PageShell({
  children,
  mainClassName,
}: {
  children: React.ReactNode;
  mainClassName?: string;
}) {
  return (
    <div
      data-theme="answer-print"
      className="flex min-h-dvh flex-col bg-background font-sans text-foreground"
    >
      <SiteNav />
      <main className={cn('flex-1', mainClassName)}>{children}</main>
      <SiteFooter />
    </div>
  );
}
