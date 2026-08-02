import { notFound } from 'next/navigation';
import { Text } from '@astryxdesign/core/Text';
import { getProjectByShareToken } from '@/lib/projects';
import { ProposalView } from '@/components/proposal-view';

/**
 * The client-facing proposal.
 *
 * The token in the URL is the entire credential — there is no session here, by
 * design, because the person opening this is a client who will never have an
 * account. Same shape as `/vendor/[token]`.
 *
 * READ-ONLY, and that is the whole point of the feature. No approve control:
 * approving commits a production to the quoted spend and belongs to the owner
 * (enforced server-side in #47, not merely hidden here). The CSV download is
 * offered because a spreadsheet of numbers you can already see grants nothing
 * further.
 *
 * Revocation needs no code: the owner nulls the column and
 * `getProjectByShareToken` stops matching, so this becomes a 404 on the next
 * request.
 */
export default async function SharedProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await getProjectByShareToken(token);

  // Unknown token, revoked token and deleted project are all notFound(). A
  // shared link that said "this was revoked" would confirm the project exists
  // to whoever the link was forwarded to next.
  if (!project) notFound();

  return (
    <ProposalView
      project={project}
      csvHref={`/api/proposal/${token}/proposal.csv`}
      eyebrow={
        <Text type="label" color="secondary">
          Shared proposal · {project.productionName}
        </Text>
      }
    />
  );
}

/**
 * A shared link must never be indexed, and must not leak the production name
 * into a search result or a link preview.
 */
export const metadata = {
  title: 'Shared proposal · Prop Haus',
  robots: { index: false, follow: false },
};
