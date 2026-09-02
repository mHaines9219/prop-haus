import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HowItWorks } from './how-it-works';

// Static four-step explainer anchored at #how for the nav link.

describe('HowItWorks', () => {
  it('anchors the section at #how with its label', () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelector('section#how')).not.toBeNull();
    expect(screen.getByText('How Prop Haus works')).toBeInTheDocument();
  });

  it('lists the four numbered steps in order', () => {
    render(<HowItWorks />);
    const labels = ['Find it', 'Source it', 'Check out', 'Get on set'];
    const heads = screen.getAllByText((_, el) => el?.tagName === 'P' && labels.some((l) => el.textContent?.endsWith(l)) === true);
    expect(heads.map((h) => h.textContent)).toEqual(['01 Find it', '02 Source it', '03 Check out', '04 Get on set']);
    expect(screen.getByText(/fill the paperwork from your profile/)).toBeInTheDocument();
  });
});
