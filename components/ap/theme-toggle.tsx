'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Dark/light switch in the nav chrome. Dark is the house default (the
 * screening room); light is the paper print. Icon shows the mode you'd
 * switch TO, matching the other quiet icon controls in the bar.
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
      className="text-text-secondary transition-colors duration-150 hover:text-foreground"
    >
      {isDark ? (
        <Sun size={20} strokeWidth={1.5} aria-hidden />
      ) : (
        <Moon size={20} strokeWidth={1.5} aria-hidden />
      )}
    </button>
  );
}
