import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/test/mocks/supabase-admin';
import { OTHER_ORG_ID, ORG_ID, signIn, signOut } from '@/test/mocks/session';
import SignPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));

const ORDER_ID = 'abcdef12-0000-4000-8000-000000000001';

function docRow(over: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    org_id: ORG_ID,
    order_id: ORDER_ID,
    vendor_id: 'omega',
    vendor_form_id: null,
    kind: 'rental_agreement',
    label: 'Rental agreement',
    status: 'awaiting_signature',
    storage_path: 'org/o/doc-1.pdf',
    signed_storage_path: null,
    anvil_packet_eid: null,
    anvil_document_group_eid: null,
    sign_url: `/orders/${ORDER_ID}/sign/doc-1?mock=1`,
    error: null,
    created_at: '2026-11-06T18:00:00Z',
    updated_at: '2026-11-06T18:00:00Z',
    ...over,
  };
}

function props(id = ORDER_ID, docId = 'doc-1') {
  return { params: Promise.resolve({ id, docId }) };
}

beforeEach(() => {
  db.reset();
  signIn();
  vi.stubEnv('FORMS_PROVIDER', 'mock');
});

afterEach(() => vi.unstubAllEnvs());

describe('SignPage', () => {
  it('redirects a signed-out visitor to /login carrying the sign path', async () => {
    signOut();
    await expect(SignPage(props())).rejects.toThrow(
      `/login?next=${encodeURIComponent(`/orders/${ORDER_ID}/sign/doc-1`)}`,
    );
  });

  it('404s on a document that belongs to another org', async () => {
    db.seed('order_documents', [docRow({ org_id: OTHER_ORG_ID })]);
    await expect(SignPage(props())).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s on a document reached through a different order', async () => {
    db.seed('order_documents', [docRow()]);
    await expect(SignPage(props('another-order'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s on a missing document', async () => {
    await expect(SignPage(props(ORDER_ID, 'nope'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders the mock signing button, says the user signs, and links back and to the download', async () => {
    db.seed('order_documents', [docRow()]);
    const { container } = render(await SignPage(props()));

    expect(screen.getByText('Order #ABCDEF12 · Sign')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Rental agreement' })).toBeInTheDocument();
    expect(screen.getByText('SIGN NEEDED')).toBeInTheDocument();
    expect(screen.getByText(/Filled from your order profile\. Read it, then sign it yourself\./)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/prop haus (signs|insures|brokers)/i);
    expect(screen.getByRole('button', { name: 'Sign as the ordering contact' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to order' })).toHaveAttribute('href', `/orders/${ORDER_ID}`);
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/api/forms/doc-1/download');
  });

  it('embeds the Anvil signing frame when the real provider is on', async () => {
    vi.stubEnv('FORMS_PROVIDER', 'anvil');
    db.seed('order_documents', [docRow({ sign_url: 'https://app.useanvil.com/etch/sign/abc' })]);
    render(await SignPage(props()));

    expect(screen.getByTitle('Sign Rental agreement')).toHaveAttribute('src', 'https://app.useanvil.com/etch/sign/abc');
    expect(screen.queryByRole('button', { name: 'Sign as the ordering contact' })).toBeNull();
  });

  it('offers no signing control for a mock-filled document once Anvil is the provider', async () => {
    vi.stubEnv('FORMS_PROVIDER', 'anvil');
    db.seed('order_documents', [docRow()]);
    render(await SignPage(props()));
    expect(screen.getByText('This copy was filled without Anvil. Refill it from the order to sign it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign as the ordering contact' })).toBeNull();
    expect(screen.queryByTitle('Sign Rental agreement')).toBeNull();
  });

  it('says a signed document is done and offers no signing control', async () => {
    db.seed('order_documents', [docRow({ status: 'signed' })]);
    render(await SignPage(props()));
    expect(screen.getByText('Signed. The signed copy is on the order.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says a document without a sign link is not waiting, shows its note, and hides download without a PDF', async () => {
    db.seed('order_documents', [docRow({ sign_url: null, storage_path: null, error: 'Blank: EIN' })]);
    render(await SignPage(props()));
    expect(screen.getByText('This document is not waiting for a signature.')).toBeInTheDocument();
    expect(screen.getByText('Blank: EIN')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it('says a filled document that needs no signature is not waiting', async () => {
    db.seed('order_documents', [docRow({ status: 'filled' })]);
    render(await SignPage(props()));
    expect(screen.getByText('This document is not waiting for a signature.')).toBeInTheDocument();
  });
});
