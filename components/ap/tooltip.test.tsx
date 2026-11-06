import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Tooltip } from './tooltip';

const rect = { top: 100, left: 40, width: 20, height: 10, right: 60, bottom: 110, x: 40, y: 100, toJSON: () => ({}) };

function setup(side?: 'top' | 'right') {
  render(
    <Tooltip label="Paperwork complete" content="Every document is accounted for." side={side}>
      <svg aria-hidden />
    </Tooltip>,
  );
  const trigger = screen.getByLabelText('Paperwork complete');
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
  return { trigger, tip: screen.getByRole('tooltip') };
}

describe('Tooltip', () => {
  it('names the trigger, describes it with the tooltip, and is reachable by keyboard', async () => {
    const { trigger, tip } = setup();
    expect(tip).toHaveTextContent('Every document is accounted for.');
    expect(trigger).toHaveAttribute('aria-describedby', tip.id);
    expect(trigger).toHaveAccessibleDescription('Every document is accounted for.');

    await userEvent.tab();
    expect(trigger).toHaveFocus();
  });

  it('renders no portal on the server pass', () => {
    const html = renderToString(
      <Tooltip label="Paperwork complete" content="Every document is accounted for.">
        <svg aria-hidden />
      </Tooltip>,
    );
    expect(html).toContain('Paperwork complete');
    expect(html).not.toContain('role="tooltip"');
  });

  it('shows above the trigger on hover and hides on leave', async () => {
    const { trigger, tip } = setup();
    expect(tip).toHaveClass('opacity-0');
    expect(tip).not.toHaveClass('opacity-100');

    await userEvent.hover(trigger);
    expect(tip).toHaveClass('opacity-100');
    expect(tip).toHaveStyle({ top: '92px', left: '50px' });

    await userEvent.unhover(trigger);
    expect(tip).not.toHaveClass('opacity-100');
    expect(tip.getAttribute('style')).toBeFalsy();
  });

  it('opens to the right of the trigger when side is right', async () => {
    const { trigger, tip } = setup('right');
    await userEvent.hover(trigger);
    expect(tip).toHaveStyle({ top: '105px', left: '68px' });
  });

  it('shows on keyboard focus and hides on blur', () => {
    const { trigger, tip } = setup();
    vi.spyOn(trigger, 'matches').mockReturnValue(true);
    fireEvent.focus(trigger);
    expect(tip).toHaveClass('opacity-100');

    fireEvent.blur(trigger);
    expect(tip).not.toHaveClass('opacity-100');
  });

  it('stays hidden when focus is not keyboard-visible', () => {
    const { trigger, tip } = setup();
    vi.spyOn(trigger, 'matches').mockReturnValue(false);
    fireEvent.focus(trigger);
    expect(tip).not.toHaveClass('opacity-100');
  });
});
