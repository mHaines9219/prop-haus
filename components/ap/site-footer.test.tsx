import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from './site-footer';

// Footer credit and the ownership disclaimer every page carries.

describe('SiteFooter', () => {
  it('renders the wordmark, city and ownership disclaimer', () => {
    render(<SiteFooter />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Prop Haus');
    expect(footer).toHaveTextContent('Los Angeles');
    expect(footer).toHaveTextContent(/All inventory shown belongs to and is owned by the listed source/);
  });
});
