import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from './textarea';

// shadcn textarea wrapper: base classes merged with overrides, props forwarded.

describe('Textarea', () => {
  it('forwards native props and merges classes onto the base styling', async () => {
    const onChange = vi.fn();
    render(<Textarea placeholder="Notes" className="resize-none" onChange={onChange} aria-label="Notes" />);
    const ta = screen.getByRole('textbox', { name: 'Notes' });
    expect(ta).toHaveAttribute('data-slot', 'textarea');
    expect(ta).toHaveClass('min-h-16', 'resize-none');
    await userEvent.type(ta, 'hi');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(ta).toHaveValue('hi');
  });

  it('respects disabled and aria-invalid', () => {
    render(<Textarea disabled aria-invalid aria-label="x" />);
    const ta = screen.getByRole('textbox');
    expect(ta).toBeDisabled();
    expect(ta).toHaveAttribute('aria-invalid', 'true');
  });
});
