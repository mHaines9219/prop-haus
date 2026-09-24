import { cn } from '@/lib/utils';
import { SiteFooter } from './site-footer';
import { SiteNav } from './site-nav';

/**
 * Party Line page frame (DESIGN.md §6): the green binder nav, then the page
 * itself: a cream sheet with an ink rule, set into the vinyl with a gutter.
 * Everything inside <main> is in the `.sheet` scope, so every token-built
 * component reads as ink-on-paper without knowing it moved.
 *
 * The home page keeps its own bespoke layout (ad boxes straight on the
 * vinyl); everything else composes this.
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
      <div className="flex flex-1 flex-col px-2 pb-2 pt-2 sm:px-3 sm:pb-3 sm:pt-3">
        <main
          className={cn(
            'sheet flex flex-1 flex-col border-[1.5px] border-ink shadow-[3px_3px_0_rgba(0,0,0,0.28)]',
            mainClassName,
          )}
        >
          {children}
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
