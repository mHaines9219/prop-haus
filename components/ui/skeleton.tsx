import { cn } from '@/lib/utils';

/** Loading placeholder: a dark inset shape with `pulse`, mirroring the real layout (DESIGN.md §9.9). */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse bg-surface-inset', className)}
      {...props}
    />
  );
}

export { Skeleton };
