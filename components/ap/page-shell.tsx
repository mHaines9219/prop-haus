import { cn } from '@/lib/utils';
import { SiteFooter } from './site-footer';
import { SiteNav } from './site-nav';

/**
 * Standard Nocturne page frame: the 56px nav and the footer credit. Every page
 * renders its own chrome through this shared shell. The body gradient background
 * comes from globals.css on :root; this wrapper is purely a flex container.
 * The home page keeps its own bespoke layout; everything else composes this.
 */
export function PageShell({
  children,
  mainClassName,
}: {
  children: React.ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col font-sans text-foreground">
      <SiteNav />
      <main className={cn('flex-1', mainClassName)}>{children}</main>
      <SiteFooter />
    </div>
  );
}
