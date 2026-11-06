import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('forwards type and native props, and merges classes onto the ink-rule styling', async () => {
    const onChange = vi.fn();
    render(<Input type="email" aria-label="Email" placeholder="you@studio.com" className="max-w-xs" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('data-slot', 'input');
    expect(input).toHaveAttribute('placeholder', 'you@studio.com');
    expect(input).toHaveClass('border', 'border-border', 'bg-input', 'max-w-xs');
    expect(input.className).not.toMatch(/\brounded/);
    await userEvent.type(input, 'ab');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue('ab');
  });

  it('ignores typing when disabled', async () => {
    render(<Input aria-label="Name" disabled />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toBeDisabled();
    await userEvent.type(input, 'x');
    expect(input).toHaveValue('');
  });
});
