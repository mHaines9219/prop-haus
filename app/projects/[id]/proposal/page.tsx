import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { List } from '@astryxdesign/core/List';
import { Item } from '@astryxdesign/core/Item';
import { getProject } from '@/lib/projects';
import { SOURCE_META } from '@/lib/types';
import { ApproveButton } from './approve';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const LINE_STATUS: Record<string, BadgeVariant> = {
  available: 'success',
  sub: 'warning',
  unavailable: 'neutral',
  pending: 'neutral',
};

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const vendorTotals = project.vendors.map((v) => {
    const subtotal = v.items.reduce((n, i) => {
      if (i.status === 'available' || i.status === 'sub') return n + (i.priceQuote ?? 0) * i.qty;
      return n;
    }, 0);
    return { vendor: v, subtotal };
  });
  const grandTotal = vendorTotals.reduce((n, v) => n + v.subtotal, 0);

  return (
    <div className="max-w-4xl space-y-10">
      <div className="space-y-2">
        <Link href={`/projects/${project.id}`}>← back to project</Link>
        <Heading level={1}>Consolidated proposal</Heading>
        <Text color="secondary">
          {project.productionName} · #{project.id} · {project.startDate} → {project.endDate}
        </Text>
      </div>

      <div className="space-y-6">
        {vendorTotals.map(({ vendor: v, subtotal }) => {
          const meta = SOURCE_META[v.vendor];
          return (
            <Card key={v.token}>
              <div className="mb-4 flex items-baseline justify-between">
                <Heading level={2}>{meta?.name ?? v.vendor}</Heading>
                <Text>
                  Subtotal:{' '}
                  <Text as="span" weight="semibold">
                    ${subtotal.toFixed(2)}
                  </Text>
                </Text>
              </div>
              <List hasDividers>
                {v.items.map((i) => {
                  const priced =
                    i.priceQuote !== undefined && (i.status === 'available' || i.status === 'sub');
                  const detail = [
                    i.subNote ? `Sub: ${i.subNote}` : null,
                    priced
                      ? `$${i.priceQuote!.toFixed(2)} × ${i.qty} = $${(i.priceQuote! * i.qty).toFixed(2)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Item
                      as="li"
                      key={i.itemId}
                      startContent={
                        i.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.image} alt="" className="h-14 w-14 shrink-0 object-cover" />
                        ) : (
                          <span className="block h-14 w-14 shrink-0 bg-muted" />
                        )
                      }
                      label={
                        <>
                          {i.name} <Text as="span" color="secondary">×{i.qty}</Text>
                        </>
                      }
                      description={detail || undefined}
                      endContent={
                        <Badge variant={LINE_STATUS[i.status] ?? 'neutral'} label={i.status} />
                      }
                    />
                  );
                })}
              </List>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-ink/30 pt-6">
        <div>
          <Text type="label" color="secondary">
            Grand total (estimate)
          </Text>
          <Heading level={2}>${grandTotal.toFixed(2)}</Heading>
        </div>
        {project.status === 'confirmed' ? (
          <Link href={`/projects/${project.id}`} isStandalone>
            Approved — view project
          </Link>
        ) : (
          <ApproveButton id={project.id} />
        )}
      </div>
    </div>
  );
}
