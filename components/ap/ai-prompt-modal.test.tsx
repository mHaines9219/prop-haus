import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AIPromptModal } from './ai-prompt-modal';

// The AI-mode curation dialog: open/close paths, escape, the trimmed
// inspiration + parsed budget contract of onSubmit, and the disabled submit.

vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants']);
  const strip = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k]) => !MOTION.has(k)));
  const cache = new Map<string, React.FC<any>>();
  return {
    motion: new Proxy({}, {
      get: (_t, tag) => {
        const k = String(tag);
        if (!cache.has(k)) cache.set(k, ({ children, ...p }: any) => React.createElement(k, strip(p), children));
        return cache.get(k);
      },
    }),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
  };
});

const focused = () => waitFor(() => expect(screen.getByLabelText('Inspiration')).toHaveFocus());

function setup(over: Partial<React.ComponentProps<typeof AIPromptModal>> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(<AIPromptModal open onSubmit={onSubmit} onClose={onClose} {...over} />);
  return { onSubmit, onClose, ...utils };
}

describe('AIPromptModal', () => {
  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('opens as a labelled modal dialog with the form fields', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'AI set curation' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Curate a set' })).toBeInTheDocument();
    expect(screen.getByLabelText('Inspiration')).toBeInTheDocument();
    expect(screen.getByLabelText(/Budget/)).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('moves focus to the inspiration field on open', async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText('Inspiration')).toHaveFocus());
  });

  it('prefills and re-syncs the inspiration from the prop each time it opens', () => {
    const { rerender, onSubmit, onClose } = setup({ initialInspiration: 'noir office' });
    expect(screen.getByLabelText('Inspiration')).toHaveValue('noir office');

    rerender(<AIPromptModal open={false} onSubmit={onSubmit} onClose={onClose} initialInspiration="noir office" />);
    rerender(<AIPromptModal open onSubmit={onSubmit} onClose={onClose} initialInspiration="70s lounge" />);
    expect(screen.getByLabelText('Inspiration')).toHaveValue('70s lounge');
  });

  it('keeps the submit disabled until there is non-whitespace inspiration', async () => {
    const { onSubmit } = setup();
    await focused();
    const submit = screen.getByRole('button', { name: 'Curate my set' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Inspiration'), '   ');
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Inspiration'), 'x');
    expect(submit).toBeEnabled();
  });

  it('submits the trimmed inspiration with a null budget when none is given', async () => {
    const { onSubmit } = setup();
    await focused();
    await userEvent.type(screen.getByLabelText('Inspiration'), '  moody bar  ');
    await userEvent.click(screen.getByRole('button', { name: 'Curate my set' }));
    expect(onSubmit).toHaveBeenCalledWith({ inspiration: 'moody bar', budget: null });
  });

  it('strips non-numeric budget characters and parses the number', async () => {
    const { onSubmit } = setup({ initialInspiration: 'set' });
    await focused();
    const budget = screen.getByLabelText(/Budget/);
    await userEvent.type(budget, '$2,500.50');
    expect(budget).toHaveValue('2500.50');
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ inspiration: 'set', budget: 2500.5 });
  });

  it('treats a budget with no digits as null', async () => {
    const { onSubmit } = setup({ initialInspiration: 'set' });
    await focused();
    await userEvent.type(screen.getByLabelText(/Budget/), 'abc');
    expect(screen.getByLabelText(/Budget/)).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Curate my set' }));
    expect(onSubmit).toHaveBeenCalledWith({ inspiration: 'set', budget: null });
  });

  it('closes on Escape, the close icon, Cancel, and the backdrop', async () => {
    const { onClose, container } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(3);

    fireEvent.click(container.querySelector('.backdrop-blur-sm')!);
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('stops listening for Escape and restores body scroll after closing', async () => {
    const { rerender, onSubmit, onClose } = setup();
    rerender(<AIPromptModal open={false} onSubmit={onSubmit} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('');
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
