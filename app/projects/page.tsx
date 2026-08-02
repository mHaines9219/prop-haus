import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Badge } from '@astryxdesign/core/Badge';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List } from '@astryxdesign/core/List';
import { Item } from '@astryxdesign/core/Item';
import { listProjects, type Project } from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { ArchiveButton } from './archive-button';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const PROJECT_STATUS: Record<string, BadgeVariant> = {
  submitted: 'neutral',
  quoting: 'warning',
  proposed: 'success',
  confirmed: 'info',
  cancelled: 'neutral',
};

/**
 * What each status means in the words a production would use. The raw enum value
 * is accurate but tells a set decorator nothing about whether they need to act.
 */
const STATUS_MEANING: Record<string, string> = {
  submitted: 'Sent to vendors — waiting on replies',
  quoting: 'Some vendors have replied',
  proposed: 'All vendors replied — proposal ready',
  confirmed: 'Approved',
  cancelled: 'Cancelled',
};

function itemProgress(p: Project) {
  const total = p.vendors.reduce((n, v) => n + v.items.length, 0);
  const answered = p.vendors.reduce(
    (n, v) => n + v.items.filter((i) => i.status !== 'pending').length,
    0,
  );
  return { total, answered };
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === '1';
  // Redirects to sign-in when signed out, carrying the destination so the
  // visitor lands back here rather than on the default.
  const orgId = await requireOrgId('/projects');
  const projects = await listProjects(orgId, { includeArchived: showArchived });

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <Heading level={1}>{showArchived ? 'All jobs' : 'Your jobs'}</Heading>
          <Link href={showArchived ? '/projects' : '/projects?archived=1'} isStandalone>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        </div>
        <Text color="secondary">
          Every sourcing request you have submitted, newest first.
        </Text>
      </div>


      {projects.length === 0 ? (
        <EmptyState
          title={showArchived ? 'No jobs yet' : 'No active jobs'}
          description={
            showArchived
              ? 'Jobs appear here once you build a cart and submit a sourcing request.'
              : 'Nothing active right now. Archived jobs are hidden — browse the catalog to start a new one.'
          }
        />
      ) : (
        <List hasDividers>
          {projects.map((p) => {
            const { total, answered } = itemProgress(p);
            const vendors = p.vendors.length;
            return (
              <Item
                as="li"
                key={p.id}
                href={`/projects/${p.id}`}
                label={p.productionName}
                description={[
                  STATUS_MEANING[p.status],
                  `${p.startDate} → ${p.endDate}`,
                  `${vendors} vendor${vendors === 1 ? '' : 's'}`,
                  `${answered}/${total} items answered`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                endContent={
                  <div className="flex items-center gap-3">
                    {p.archivedAt && <Badge variant="neutral" label="archived" />}
                    <Badge variant={PROJECT_STATUS[p.status] ?? 'neutral'} label={p.status} />
                    <ArchiveButton projectId={p.id} isArchived={Boolean(p.archivedAt)} />
                  </div>
                }
              />
            );
          })}
        </List>
      )}
    </div>
  );
}
