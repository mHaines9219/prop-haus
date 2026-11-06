import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { READY_PROFILE } from '@/test/fixtures/orders';
import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));

import { db } from '@/test/mocks/supabase-admin';
import PassportPage from './page';

const W9 = {
  storagePath: `${ORG_ID}/passport/w9.pdf`,
  name: 'ours-w9.pdf',
  mime: 'application/pdf',
  uploadedAt: '2026-09-01T00:00:00Z',
};

function rowFor(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'p' }).parentElement!.parentElement!;
}

beforeEach(() => {
  db.reset();
  signIn();
});

describe('PassportPage', () => {
  it('redirects a signed-out visitor to /login with next=/account/passport', async () => {
    signOut();
    await expect(PassportPage()).rejects.toThrow('/login?next=%2Faccount%2Fpassport');
  });

  it('renders an empty wallet for an org with nothing on file', async () => {
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE, passport: {} }]);
    render(await PassportPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Passport' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'order profile' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByText('0 of 7 on file')).toBeInTheDocument();
    expect(screen.getAllByText('Nothing on file')).toHaveLength(7);
  });

  it('shows the org documents and its COI, never another org', async () => {
    db.seed('organizations', [
      {
        id: ORG_ID,
        order_profile: {
          ...READY_PROFILE,
          insurance: {
            coiDocument: { storagePath: `${ORG_ID}/coi/c.pdf`, name: 'our-coi.pdf', uploadedAt: W9.uploadedAt },
          },
        },
        passport: { documents: { w9: W9 } },
      },
      {
        id: OTHER_ORG_ID,
        order_profile: READY_PROFILE,
        passport: { documents: { voided_check: { ...W9, name: 'their-check.pdf' } } },
      },
    ]);
    render(await PassportPage());
    expect(within(rowFor('W-9')).getByRole('link', { name: 'ours-w9.pdf' })).toBeInTheDocument();
    expect(within(rowFor('Certificate of insurance')).getByRole('link', { name: 'our-coi.pdf' })).toBeInTheDocument();
    expect(within(rowFor('Voided check or bank letter')).getByText('Nothing on file')).toBeInTheDocument();
    expect(screen.queryByText('their-check.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('2 of 7 on file')).toBeInTheDocument();
  });
});
