import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Table primitives (shadcn shape, Answer Print skin).
 *
 * Rows are full-width list rows with 1px hairline seams and radius 0
 * (DESIGN.md §6, §9.7). Header labels are 11px mono uppercase, hover changes
 * fill only, never a border. The wrapper scrolls sideways on narrow screens so
 * the page body never does.
 */

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full border-collapse text-[15px] leading-[22px]', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:border-border', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border transition-colors duration-150 hover:bg-surface-inset data-[state=selected]:bg-surface-inset',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 whitespace-nowrap px-3 text-left align-middle font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary first:pl-4 last:pr-4 sm:first:pl-6 sm:last:pr-6',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-3 align-middle first:pl-4 last:pr-4 sm:first:pl-6 sm:last:pr-6', className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-3 font-mono text-[11px] text-text-tertiary', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
