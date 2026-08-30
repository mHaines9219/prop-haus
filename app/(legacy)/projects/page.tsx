import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Badge } from '@astryxdesign/core/Badge';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List } from '@astryxdesign/core/List';
import { Item } from '@astryxdesign/core/Item';
import { listProjects } from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { ArchiveButton } from './archive-button';

export default async function ProjectsPage({
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
          <Heading level={1}>{showArchived ? 'All folders' : 'Your folders'}</Heading>
          <Link href={showArchived ? '/projects' : '/projects?archived=1'} isStandalone>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        </div>
        <Text color="secondary">Items you&rsquo;ve saved while browsing the catalog, by project.</Text>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title={showArchived ? 'No folders yet' : 'No active folders'}
          description={
            showArchived
              ? 'Folders appear here once you save an item to a project while browsing.'
              : 'Nothing active right now. Archived folders are hidden — browse the catalog to start a new one.'
          }
        />
      ) : (
        <List hasDividers>
          {projects.map((p) => (
            <Item
              as="li"
              key={p.id}
              href={`/projects/${p.id}`}
              label={p.name}
              description={`${p.items.length} item${p.items.length === 1 ? '' : 's'}`}
              endContent={
                <div className="flex items-center gap-3">
                  {p.archivedAt && <Badge variant="neutral" label="archived" />}
                  <ArchiveButton projectId={p.id} isArchived={Boolean(p.archivedAt)} />
                </div>
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}
