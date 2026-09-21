import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  it('names the trigger, describes it with the tooltip, and is reachable by keyboard', async () => {
    render(
      <Tooltip label="Paperwork complete" content="Every document is accounted for.">
        <svg aria-hidden />
      </Tooltip>,
    );
    const trigger = screen.getByLabelText('Paperwork complete');
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Every document is accounted for.');
    expect(trigger).toHaveAttribute('aria-describedby', tip.id);
    expect(trigger).toHaveAccessibleDescription('Every document is accounted for.');

    await userEvent.tab();
    expect(trigger).toHaveFocus();
  });
});
