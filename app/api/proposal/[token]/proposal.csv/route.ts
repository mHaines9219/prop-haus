import { getProjectByShareToken } from '@/lib/projects';
import { proposalFilename, proposalToCsv } from '@/lib/proposal-csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The shared proposal as a spreadsheet.
 *
 * Behind the same token as the page it belongs to. That pairing is the reason
 * the export and the page moved together in one change rather than two: an
 * export reachable by id while the page needed a token would have been the same
 * hole one URL to the left.
 *
 * The owner's own download lives at `/api/projects/[id]/proposal.csv` and is
 * org-scoped. Two routes rather than one because they authenticate differently
 * — a single route accepting either credential is how the weaker one ends up
 * standing in for the stronger.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = await getProjectByShareToken(token);
  if (!project) return new Response('Not found', { status: 404 });

  return new Response(proposalToCsv(project), {
    headers: {
      // charset matters: item names carry accents and typographic quotes.
      'Content-Type': 'text/csv; charset=utf-8',
      // `attachment` so a browser saves it rather than rendering it as text.
      'Content-Disposition': `attachment; filename="${proposalFilename(project)}"`,
      // A proposal changes whenever a vendor answers; a cached copy would be a
      // stale budget, which is worse than a slow one. Also keeps a revoked
      // link's contents out of any shared cache.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
