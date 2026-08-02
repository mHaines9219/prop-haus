import { getProject } from '@/lib/projects';
import { proposalFilename, proposalToCsv } from '@/lib/proposal-csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The consolidated proposal as a spreadsheet.
 *
 * NOT org-scoped, matching `/projects/[id]/proposal` itself: the proposal URL is
 * deliberately shareable outside the owning organization so a production can
 * hand it to a client. Scoping the export while the page it exports stays open
 * would be security theatre — the same rows are already readable one click away.
 *
 * That sharing model is being replaced with a revocable share token (BOSS's
 * call, after this). When it lands, this route moves behind the same token as
 * the page, in one change rather than two.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
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
