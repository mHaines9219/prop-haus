import * as React from 'react';

import { cn } from '@/lib/utils';

/** Text input (shadcn shape, Party Line skin): an ink rule around cream stock; the rule goes solid ink on focus. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 border border-border bg-input px-3 text-[14px] leading-none text-foreground outline-none transition-colors duration-150',
        'placeholder:text-text-tertiary hover:border-border-strong focus-visible:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
