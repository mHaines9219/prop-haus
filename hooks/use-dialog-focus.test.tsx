import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useDialogFocus } from './use-dialog-focus';

// Modal focus: in on open, trapped while open, back to the opener on close.

function Dialog({ open, autofocus = false }: { open: boolean; autofocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(open, ref);
  return (
    <>
      <button type="button">Opener</button>
      {open && (
        <div ref={ref} role="dialog">
          <button type="button">First</button>
          <input aria-label="Middle" data-autofocus={autofocus || undefined} />
          <button type="button" disabled>
            Disabled
          </button>
          <button type="button">Last</button>
        </div>
      )}
    </>
  );
}

function openFrom(autofocus?: boolean) {
  const utils = render(<Dialog open={false} autofocus={autofocus} />);
  screen.getByRole('button', { name: 'Opener' }).focus();
  utils.rerender(<Dialog open autofocus={autofocus} />);
  return utils;
}

const tab = (shiftKey = false) => fireEvent.keyDown(document, { key: 'Tab', shiftKey });

describe('useDialogFocus', () => {
  it('moves focus to the first focusable element on open', () => {
    openFrom();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('prefers an element marked data-autofocus', () => {
    openFrom(true);
    expect(screen.getByLabelText('Middle')).toHaveFocus();
  });

  it('wraps Tab from the last element to the first, skipping disabled ones', () => {
    openFrom();
    screen.getByRole('button', { name: 'Last' }).focus();
    tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    openFrom();
    tab(true);
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('leaves Tab alone between inner elements', () => {
    openFrom();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('pulls focus back in when it has escaped the dialog', () => {
    openFrom();
    screen.getByRole('button', { name: 'Opener' }).focus();
    tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('restores focus to the opener on close and stops trapping', () => {
    const { rerender } = openFrom();
    rerender(<Dialog open={false} />);
    expect(screen.getByRole('button', { name: 'Opener' })).toHaveFocus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
