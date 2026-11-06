import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OutreachDrawer, formatSentAt, type DrawerMessage } from './outreach-drawer';

function message(over: Partial<DrawerMessage> = {}): DrawerMessage {
  return {
    vendorName: 'Omega Cinema Props',
    to: 'rentals@omega.example',
    cc: [],
    replyTo: 'order-o1@reply.prophaus.example',
    subject: 'Rental request: Credenza',
    bodyText: 'Hi Omega,\n\nWe would like to rent the credenza.',
    attachments: [],
    ...over,
  };
}

function dialog() {
  return screen.getByRole('dialog', { name: 'Email to Omega Cinema Props' });
}

function EditableHarness({ initial, footnote }: { initial: DrawerMessage; footnote?: string }) {
  const [draft, setDraft] = useState(initial);
  const edited = draft.subject !== initial.subject || draft.bodyText !== initial.bodyText;
  return (
    <OutreachDrawer
      message={draft}
      onClose={() => {}}
      editing={{
        edited,
        footnote,
        onChange: (patch) => setDraft((d) => ({ ...d, ...patch })),
        onReset: () => setDraft(initial),
      }}
    />
  );
}

describe('OutreachDrawer', () => {
  it('renders nothing while closed', () => {
    render(<OutreachDrawer message={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a sent email read-only: envelope, status, sent time, subject, body, attachments', () => {
    render(
      <OutreachDrawer
        message={message({
          cc: ['ap@prod.example', 'coord@prod.example'],
          status: 'sent',
          sentAt: '2026-11-06T18:30:00Z',
          attachments: [{ name: 'COI.pdf' }, { name: 'Rental agreement.pdf' }],
        })}
        onClose={() => {}}
      />,
    );
    const d = dialog();
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(within(d).getByText('Email sent')).toBeInTheDocument();
    expect(within(d).getByRole('heading', { name: 'Omega Cinema Props' })).toBeInTheDocument();
    expect(within(d).getByText('rentals@omega.example')).toBeInTheDocument();
    expect(within(d).getByText('ap@prod.example, coord@prod.example')).toBeInTheDocument();
    expect(within(d).getByText('order-o1@reply.prophaus.example')).toBeInTheDocument();
    expect(within(d).getByText('SENT')).toBeInTheDocument();
    expect(within(d).getByText(formatSentAt('2026-11-06T18:30:00Z'))).toBeInTheDocument();
    expect(within(d).getByText('Rental request: Credenza')).toBeInTheDocument();
    expect(within(d).getByText(/We would like to rent the credenza/)).toBeInTheDocument();
    expect(within(d).getByText('COI.pdf')).toBeInTheDocument();
    expect(within(d).getByText('Rental agreement.pdf')).toBeInTheDocument();
    expect(within(d).queryByRole('textbox')).toBeNull();
    expect(within(d).queryByText(/with the click/)).toBeNull();
  });

  it('labels a sandbox email as written, not sent, and shows a failure reason', () => {
    render(<OutreachDrawer message={message({ status: 'sandbox', error: 'Mailer rejected the address' })} onClose={() => {}} />);
    expect(within(dialog()).getByText('Email written, not sent')).toBeInTheDocument();
    expect(within(dialog()).getByText('NOT SENT')).toBeInTheDocument();
    expect(within(dialog()).getByText('Mailer rejected the address')).toBeInTheDocument();
  });

  it('says when there is no address on file and no attachments', () => {
    render(<OutreachDrawer message={message({ to: '' })} onClose={() => {}} />);
    expect(within(dialog()).getByText('No address on file')).toBeInTheDocument();
    expect(within(dialog()).getByText('None')).toBeInTheDocument();
    expect(within(dialog()).queryByText('Cc')).toBeNull();
  });

  it('shows warnings as notes to the user, kept out of the email', () => {
    render(
      <OutreachDrawer
        message={message({ warnings: ['Your COI limit is below Omega’s $2M minimum.'] })}
        onClose={() => {}}
      />,
    );
    expect(within(dialog()).getByText('Your COI limit is below Omega’s $2M minimum.')).toBeInTheDocument();
    expect(within(dialog()).getByText('Shown to you only. Not part of the email.')).toBeInTheDocument();
  });

  it('closes on Escape, the close button, and the scrim, and locks page scroll while open', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<OutreachDrawer message={message()} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(container.querySelector('[aria-hidden="true"]') as Element);
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(<OutreachDrawer message={null} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('takes focus on open, keeps Tab inside, and returns focus to the opener on close', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">Open email</button>
        <OutreachDrawer message={null} onClose={onClose} />
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Open email' });
    opener.focus();
    rerender(
      <>
        <button type="button">Open email</button>
        <OutreachDrawer message={message()} onClose={onClose} />
      </>,
    );
    const close = within(dialog()).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);

    rerender(
      <>
        <button type="button">Open email</button>
        <OutreachDrawer message={null} onClose={onClose} />
      </>,
    );
    expect(opener).toHaveFocus();
  });

  it('lets the user edit a draft subject and body, and says the edit goes out with the click', () => {
    render(<EditableHarness initial={message()} />);
    const d = dialog();
    expect(within(d).getByText('Email draft')).toBeInTheDocument();
    expect(within(d).getByText('Sent as written with the click.')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Reset to draft' })).toBeNull();

    const subject = within(d).getByRole('textbox', { name: 'Subject' });
    const body = within(d).getByRole('textbox', { name: 'Message' });
    expect(subject).toHaveValue('Rental request: Credenza');
    fireEvent.change(subject, { target: { value: 'Hold request: Credenza' } });
    fireEvent.change(body, { target: { value: 'Hi Omega, a hold please.' } });

    expect(subject).toHaveValue('Hold request: Credenza');
    expect(body).toHaveValue('Hi Omega, a hold please.');
    expect(within(d).getByText('Your edit goes out with the click.')).toBeInTheDocument();
  });

  it('resets an edited draft back to what the platform wrote', async () => {
    render(<EditableHarness initial={message()} />);
    const subject = within(dialog()).getByRole('textbox', { name: 'Subject' });
    fireEvent.change(subject, { target: { value: 'Changed' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reset to draft' }));

    await waitFor(() => expect(subject).toHaveValue('Rental request: Credenza'));
    expect(within(dialog()).getByText('Sent as written with the click.')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: 'Reset to draft' })).toBeNull();
  });

  it('shows the caller footnote in place of the default send line', () => {
    render(<EditableHarness initial={message()} footnote="Sandbox: written to the order, never sent." />);
    expect(within(dialog()).getByText('Sandbox: written to the order, never sent.')).toBeInTheDocument();
    expect(within(dialog()).queryByText('Sent as written with the click.')).toBeNull();
  });
});

describe('formatSentAt', () => {
  it('prints month, day and time', () => {
    expect(formatSentAt('2026-11-06T18:30:00')).toBe('Nov 6, 6:30 PM');
  });
});

// Vendor reply links (FUT-5): the read-only body's URLs are links, the
// vendor's own reply links only on a sandbox order.
const LINKED_BODY =
  'Items\n1. Walnut credenza\n   https://omegacinemaprops.com/item/1\n   Item available: http://localhost:3000/vendor/respond?t=abc.def\n   Item unavailable: http://localhost:3000/vendor/respond?t=ghi.jkl\n\nReply to this email.';

describe('OutreachDrawer vendor reply links', () => {
  it('on a sandbox order, turns every URL in the body into a link that opens in a new tab and keeps the words', () => {
    render(<OutreachDrawer message={message({ bodyText: LINKED_BODY, status: 'sent', sandbox: true })} onClose={() => {}} />);
    const links = within(dialog()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://omegacinemaprops.com/item/1',
      'http://localhost:3000/vendor/respond?t=abc.def',
      'http://localhost:3000/vendor/respond?t=ghi.jkl',
    ]);
    for (const a of links) expect(a).toHaveAttribute('target', '_blank');
    expect(within(dialog()).getByText(/Item available:/)).toBeInTheDocument();
    expect(within(dialog()).getByText(/open one to answer as the vendor/)).toBeInTheDocument();
  });

  it('on a live order, links the item pages but keeps the vendor reply links as plain text', () => {
    render(<OutreachDrawer message={message({ bodyText: LINKED_BODY, status: 'sent' })} onClose={() => {}} />);
    expect(within(dialog()).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://omegacinemaprops.com/item/1']);
    expect(within(dialog()).getByText(/vendor\/respond\?t=abc\.def/)).toBeInTheDocument();
    expect(within(dialog()).queryByText(/open one to answer as the vendor/)).toBeNull();
  });

  it('keeps the editable body a plain textarea with no links', () => {
    render(<EditableHarness initial={message({ bodyText: LINKED_BODY })} />);
    expect(within(dialog()).getAllByRole('textbox')).toHaveLength(2);
    expect(within(dialog()).queryByRole('link')).toBeNull();
  });
});
