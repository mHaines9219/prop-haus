import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

function OrderTabs({ onValueChange }: { onValueChange?: (v: string) => void }) {
  return (
    <Tabs defaultValue="items" onValueChange={onValueChange} className="mt-4">
      <TabsList aria-label="Order sections">
        <TabsTrigger value="items">Items</TabsTrigger>
        <TabsTrigger value="emails">Emails</TabsTrigger>
        <TabsTrigger value="forms" disabled>
          Forms
        </TabsTrigger>
      </TabsList>
      <TabsContent value="items">Line items</TabsContent>
      <TabsContent value="emails">Vendor emails</TabsContent>
      <TabsContent value="forms">Paperwork</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows the default panel and marks its trigger selected', () => {
    render(<OrderTabs />);
    expect(screen.getByRole('tablist', { name: 'Order sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Items' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Line items');
    expect(screen.queryByText('Vendor emails')).not.toBeInTheDocument();
  });

  it('switches panels on click and reports the new value', async () => {
    const onValueChange = vi.fn();
    render(<OrderTabs onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Emails' }));
    expect(onValueChange).toHaveBeenCalledWith('emails');
    expect(screen.getByRole('tab', { name: 'Emails' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Vendor emails');
  });

  it('never opens a disabled tab', async () => {
    const onValueChange = vi.fn();
    render(<OrderTabs onValueChange={onValueChange} />);
    const forms = screen.getByRole('tab', { name: 'Forms' });
    expect(forms).toBeDisabled();
    await userEvent.click(forms);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Line items');
  });

  it('draws the active tab as a 2px ink rule on the seam, never a pill', () => {
    render(<OrderTabs />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('border-b-2', 'data-[state=active]:border-border-strong');
      expect(tab.className).not.toMatch(/\brounded|\bbg-/);
    }
    expect(screen.getByRole('tablist')).toHaveClass('border-b', 'border-border');
  });
});
