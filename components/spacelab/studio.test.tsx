import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SpacelabStudio } from './studio';

describe('SpacelabStudio', () => {
  it('lays out the four panels under the Space Lab header', () => {
    render(<SpacelabStudio />);
    expect(screen.getByRole('heading', { name: 'Space Lab' })).toBeInTheDocument();
    for (const name of ['Items', 'Render', 'Floor plan', 'Chat']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('3/6 placed')).toBeInTheDocument();
  });

  it('appends a sent message and a placeholder reply', async () => {
    render(<SpacelabStudio />);
    const input = screen.getByLabelText('Tell the model what to change');
    await userEvent.type(input, 'sofa to the back wall');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('sofa to the back wall')).toBeInTheDocument();
    expect(screen.getByText(/not connected yet/)).toBeInTheDocument();
    expect(input).toHaveValue('');
  });
});
