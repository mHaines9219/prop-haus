// OutreachDrawer, read-only: the sent body's URLs are links, and a sandbox draft says its reply links work.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutreachDrawer, type DrawerMessage } from './outreach-drawer';

vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION = new Set(['initial', 'animate', 'exit', 'transition', 'layout', 'variants', 'mode']);
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

const BODY =
  'Items\n1. Walnut credenza\n   https://omegacinemaprops.com/item/1\n   Item available: http://localhost:3000/vendor/respond?t=abc.def\n   Item unavailable: http://localhost:3000/vendor/respond?t=ghi.jkl\n\nReply to this email.';

function message(over: Partial<DrawerMessage> = {}): DrawerMessage {
  return {
    vendorName: 'Omega Cinema Props',
    to: 'orders@omega.example',
    cc: [],
    replyTo: 'sam@nocturne.example',
    subject: 'Hold request',
    bodyText: BODY,
    attachments: [],
    status: 'sent',
    sandbox: true,
    ...over,
  };
}

describe('OutreachDrawer read-only body', () => {
  it('turns every URL in the body into a link that opens in a new tab and keeps the words', () => {
    render(<OutreachDrawer message={message()} onClose={() => {}} />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://omegacinemaprops.com/item/1',
      'http://localhost:3000/vendor/respond?t=abc.def',
      'http://localhost:3000/vendor/respond?t=ghi.jkl',
    ]);
    for (const a of links) expect(a).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Item available:/)).toBeInTheDocument();
    expect(screen.getByText(/Reply to this email\./)).toBeInTheDocument();
  });

  it('on a live order, links the item pages but keeps the vendor reply links as plain text', () => {
    render(<OutreachDrawer message={message({ sandbox: false })} onClose={() => {}} />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://omegacinemaprops.com/item/1']);
    expect(screen.getByText(/vendor\/respond\?t=abc\.def/)).toBeInTheDocument();
    expect(screen.queryByText(/open one to answer as the vendor/)).toBeNull();
  });

  it('tells an admin the reply links work on a sandbox draft', () => {
    render(<OutreachDrawer message={message()} onClose={() => {}} />);
    expect(screen.getByText(/open one to answer as the vendor/)).toBeInTheDocument();
  });

  it('keeps the editable body a plain textarea', () => {
    render(
      <OutreachDrawer
        message={message({ status: undefined, sandbox: undefined })}
        onClose={() => {}}
        editing={{ edited: false, onChange: () => {}, onReset: () => {} }}
      />,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
