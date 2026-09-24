import * as React from 'react';

import { cn } from '@/lib/utils';

/** Textarea (shadcn shape, Party Line skin): same ink rule as Input, grows with content. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full border border-border bg-input px-3 py-2 text-[14px] leading-[20px] text-foreground outline-none transition-colors duration-150',
        'placeholder:text-text-tertiary hover:border-border-strong focus-visible:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
