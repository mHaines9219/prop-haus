import * as React from 'react';

import { cn } from '@/lib/utils';

/** Text input (shadcn shape, Answer Print skin): hairline border, inset fill, no glow. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-border bg-input px-3 text-[14px] leading-none text-foreground outline-none transition-colors duration-150',
        'placeholder:text-text-tertiary hover:border-border-strong focus-visible:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
