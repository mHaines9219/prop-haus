import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { evaluate } from '@/lib/requirements/evaluate';
import { ChecklistSection } from './checklist';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const checklist = evaluate({
  profile: { productionType: 'commercial', client: { billable: true }, cast: { count: 2, minors: true }, rentals: { props: true }, venue: { name: 'The Foundry' } },
  vendorRequirements: [{ vendorId: 'propheaven', vendorName: 'Prop Heaven', requirementId: 'w9', reason: 'Prop Heaven asks new customers for a W-9.' }],
  states: [{ requirementId: 'talent_release', status: 'not_applicable' }],
  accountDocuments: [{ requirementId: 'certificate_of_insurance', name: 'coi.pdf' }],
});

const row = (name: string) => screen.getByText(name).closest('div.border-b') as HTMLElement;

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChecklistSection', () => {
  it('shows the empty state when nothing is listed', () => {
    render(<ChecklistSection projectId="p1" checklist={{ items: [], advisories: [], summary: { total: 0, complete: 0, open: 0, needsInformation: 0 } }} />);
    expect(screen.getByText('Nothing to list yet')).toBeInTheDocument();
    expect(screen.queryByText('Worth a look')).not.toBeInTheDocument();
  });

  it('groups rows by category with the reason, the status token, and the right actions', () => {
    render(<ChecklistSection projectId="p1" checklist={checklist} />);

    expect(screen.getByText('Worth a look')).toBeInTheDocument();
    expect(screen.getByText(/Minors are on set/)).toBeInTheDocument();
    expect(screen.getByText('Vendors and rentals')).toBeInTheDocument();

    const w9 = row('W-9');
    expect(within(w9).getByText('Required by Prop Heaven')).toBeInTheDocument();
    expect(within(w9).getByText('UPLOAD')).toBeInTheDocument();
    expect(within(w9).getByRole('button', { name: 'Upload mine' })).toBeInTheDocument();
    expect(within(w9).queryByRole('button', { name: 'Use template' })).not.toBeInTheDocument();

    const change = row('Change order');
    expect(within(change).getByText('TEMPLATE READY')).toBeInTheDocument();
    expect(within(change).getByRole('button', { name: 'Use template' })).toBeInTheDocument();
    expect(within(change).getByText(/Included with your plan/)).toBeInTheDocument();

    const coi = row('Certificate of insurance (COI)');
    expect(within(coi).getByText('COMPLETE')).toBeInTheDocument();
    expect(within(coi).getByText(/On file for your account:/)).toBeInTheDocument();
    expect(within(coi).queryByRole('button', { name: 'Use template' })).not.toBeInTheDocument();

    const permit = row('Child performer work permit and set requirements');
    expect(within(permit).getByText('May be legally required. Verify locally.')).toBeInTheDocument();
    expect(within(permit).getByText('Depends on where you shoot. Verify locally.')).toBeInTheDocument();
    expect(within(permit).getByText('EXTERNAL')).toBeInTheDocument();
    expect(within(permit).getByRole('button', { name: 'Mark requested' })).toBeInTheDocument();

    const talent = row('Talent release');
    expect(within(talent).getByText('N/A')).toBeInTheDocument();
    expect(within(talent).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('posts an action and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ ok: true, checklist }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChecklistSection projectId="p1" checklist={checklist} />);

    await user.click(within(row('Change order')).getByRole('button', { name: 'Not applicable' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/p1/requirements/change_order');
    expect(JSON.parse(init.body as string)).toEqual({ action: 'not_applicable' });
  });

  it('names the blanks after a template fill', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, checklist, missing: ['shoot_start_date', 'client_company'] })));
    render(<ChecklistSection projectId="p1" checklist={checklist} />);

    await user.click(within(row('Change order')).getByRole('button', { name: 'Use template' }));
    expect(await screen.findByText('Filled from your profile. Left blank: Shoot start date, Client company.')).toBeInTheDocument();
  });

  it('uploads a file as multipart to the requirement route', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ ok: true, checklist }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChecklistSection projectId="p1" checklist={checklist} />);

    const input = screen.getByLabelText('Upload W-9') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array(3)], 'w9.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/p1/requirements/w9');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('refuses an unsupported file locally and shows the server error otherwise', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ error: 'upload failed: bucket missing' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChecklistSection projectId="p1" checklist={checklist} />);

    await user.upload(screen.getByLabelText('Upload W-9'), new File([new Uint8Array(3)], 'w9.exe', { type: 'application/x-msdownload' }));
    expect(await screen.findByText(/isn’t a supported type/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(row('Change order')).getByRole('button', { name: 'Use template' }));
    expect(await screen.findByText('upload failed: bucket missing')).toBeInTheDocument();
  });
});
