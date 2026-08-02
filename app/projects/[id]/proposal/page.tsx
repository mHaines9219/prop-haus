import { notFound } from 'next/navigation';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { getProject } from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { ProposalView } from '@/components/proposal-view';
import { ApproveButton } from './approve';
import { SharePanel } from './share-panel';

/**
 * The owner's view of the proposal.
 *
 * Org-scoped as of the share-token change. This page used to be deliberately
 * open, because its URL was how a production handed a proposal to a client —
 * that job now belongs to `/proposal/[token]`, which can be revoked. Leaving
 * this one open as well would mean the revocable link sat beside a permanent
 * one for the same document.
 */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await requireOrgId(`/projects/${id}/proposal`);
  const project = await getProject(orgId, id);
  if (!project) notFound();

  return (
    <div className="space-y-8">
      <ProposalView
        project={project}
        csvHref={`/api/projects/${project.id}/proposal.csv`}
        eyebrow={<Link href={`/projects/${project.id}`}>← back to project</Link>}
        actions={
          project.status === 'confirmed' ? (
            <Text color="secondary">Approved</Text>
          ) : (
            <ApproveButton id={project.id} />
          )
        }
      />
      {/*
        The live URL, not just a boolean: the owner can copy it again without
        reissuing, so a second copy does not invalidate the one their client is
        already using. Safe to render here because this page is org-scoped.
      */}
      <SharePanel
        projectId={project.id}
        initialShareUrl={project.shareToken ? `/proposal/${project.shareToken}` : null}
      />
    </div>
  );
}
