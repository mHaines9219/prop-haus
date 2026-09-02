import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';

// Dark/light switch: hydration-safe placeholder before mount, then a button
// labelled with the mode you would switch to.

const theme = vi.hoisted(() => ({ resolvedTheme: 'dark' as string | undefined, setTheme: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => theme }));

describe('ThemeToggle', () => {
  beforeEach(() => {
    theme.resolvedTheme = 'dark';
    theme.setTheme.mockReset();
  });

  it('renders an inert placeholder on the server pass', () => {
    const html = renderToString(<ThemeToggle />);
    expect(html).toContain('aria-hidden');
    expect(html).not.toContain('<button');
  });

  it('offers light mode while dark and switches on click', async () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: 'Switch to light mode' });
    expect(btn.querySelector('svg.lucide-sun')).not.toBeNull();
    await userEvent.click(btn);
    expect(theme.setTheme).toHaveBeenCalledWith('light');
  });

  it('offers dark mode while light and switches on click', async () => {
    theme.resolvedTheme = 'light';
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(btn.querySelector('svg.lucide-moon')).not.toBeNull();
    await userEvent.click(btn);
    expect(theme.setTheme).toHaveBeenCalledWith('dark');
  });

  it('treats an unresolved theme as light', () => {
    theme.resolvedTheme = undefined;
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });
});
