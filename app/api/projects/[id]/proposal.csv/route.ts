import { getProject } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';
import { proposalFilename, proposalToCsv } from '@/lib/proposal-csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The owner's download of the consolidated proposal.
 *
 * Org-scoped now. The comment this replaces said the route was deliberately
 * open to match the page, and that when the share token landed both would move
 * behind it together — which is what happened: the client-facing download is
 * `/api/proposal/[token]/proposal.csv`, and this one is for the production that
 * owns the job.
 *
 * 401 signed out, 404 when it is not theirs — matching the other project routes
 * so this cannot be used to probe which ids exist.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const orgId = await currentOrgId();
  if (!orgId) return new Response('Not signed in', { status: 401 });

  const project = await getProject(orgId, id);
  if (!project) return new Response('Not found', { status: 404 });

  return new Response(proposalToCsv(project), {
    headers: {
      // charset matters: item names carry accents and typographic quotes.
      'Content-Type': 'text/csv; charset=utf-8',
      // `attachment` so a browser saves it rather than rendering it as text.
      'Content-Disposition': `attachment; filename="${proposalFilename(project)}"`,
      // A proposal changes whenever a vendor answers; a cached copy would be a
      // stale budget, which is worse than a slow one.
      'Cache-Control': 'no-store',
    },
  });
}
