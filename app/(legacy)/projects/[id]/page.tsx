import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List } from '@astryxdesign/core/List';
import { Item } from '@astryxdesign/core/Item';
import { getProject } from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { SOURCE_META } from '@/lib/types';
import { RemoveItemButton } from './remove-item-button';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Owner surface: sign-in required, then scoped to the caller's org. A folder
  // belonging to another org is notFound(), not forbidden.
  const orgId = await requireOrgId(`/projects/${id}`);
  const project = await getProject(orgId, id);
  if (!project) notFound();

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link href="/projects">← back to your folders</Link>
        <Heading level={1}>{project.name}</Heading>
        <Text color="secondary">
          {project.items.length} item{project.items.length === 1 ? '' : 's'}
        </Text>
      </div>

      {project.items.length === 0 ? (
        <EmptyState
          title="Nothing saved here yet"
          description="Browse the catalog and save pieces from any vendor into this folder."
        />
      ) : (
        <List hasDividers>
          {project.items.map((item) => {
            const detailHref = `/item/${item.source}/${encodeURIComponent(item.sourceId)}`;
            return (
              <Item
                as="li"
                key={item.itemId}
                startContent={
                  <Link href={detailHref}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-20 w-20 object-cover"
                      />
                    ) : (
                      <span className="block h-20 w-20 bg-[#E5E0D8]" />
                    )}
                  </Link>
                }
                label={<Link href={detailHref}>{item.name}</Link>}
                description={SOURCE_META[item.source]?.name ?? item.source}
                endContent={
                  <div className="flex items-center gap-3">
                    <Link href={item.sourceUrl} isStandalone isExternalLink>
                      View at vendor
                    </Link>
                    <RemoveItemButton projectId={project.id} itemId={item.itemId} />
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
