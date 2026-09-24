'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Binder/page switch in the nav chrome. "Dark" is the house default: the
 * green vinyl binder with cream ads set into it. "Light" opens the book to a
 * cream page. Icon shows the mode you'd switch TO, matching the other quiet
 * icon controls in the bar.
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
      className="text-paper/85 transition-colors duration-150 hover:text-white"
    >
      {isDark ? (
        <Sun size={19} strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon size={19} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
