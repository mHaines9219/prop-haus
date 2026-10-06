'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Day/lamplight switch in the nav chrome. "Light" is the house default: the
 * green vinyl binder with cream pages set into it. "Dark" is the same book by
 * lamplight: near-black vinyl, charcoal card stock, cream ink (see the theme
 * block in app/globals.css). Icon shows the mode you'd switch TO, matching
 * the other quiet icon controls in the bar.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Hydration guard: the theme comes from localStorage, so the server render
  // can't know it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span aria-hidden className="size-5" />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="text-binder-foreground/85 transition-colors duration-150 hover:text-binder-foreground"
    >
      {isDark ? (
        <Sun size={19} strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon size={19} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
