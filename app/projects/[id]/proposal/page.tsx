import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { List } from '@astryxdesign/core/List';
import { Item } from '@astryxdesign/core/Item';
import { getProject, lineTotal, proposalTotals } from '@/lib/projects';
import { FLAT_FEE_UNITS, SOURCE_META } from '@/lib/types';
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
  const project = await getProject(id);
  if (!project) notFound();

  // Shared with the CSV export, so the exported grand total cannot drift from
  // the one rendered here.
  const { vendors: vendorTotals, grandTotal } = proposalTotals(project);

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
                  const q =
                    i.status === 'available' || i.status === 'sub' ? i.quote : undefined;
                  const detail = [
                    i.subNote ? `Sub: ${i.subNote}` : null,
                    // Show every factor, so a production can audit the number rather
                    // than trust it: rate/unit × periods × qty = total.
                    q
                      ? `$${q.amount.toFixed(2)}/${q.unit}${
                          FLAT_FEE_UNITS.includes(q.unit)
                            ? ''
                            : ` × ${q.periods} ${q.unit}${q.periods === 1 ? '' : 's'}`
                        } × qty ${i.qty} = $${lineTotal(i).toFixed(2)}`
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
        <div className="flex items-center gap-4">
          {/*
            A raw anchor rather than the Astryx <Link>, and this is the one place
            in the file that is deliberate: app/providers.tsx routes every Astryx
            Link through next/link, so this would become a client-side navigation
            to a route that returns a CSV. `download` needs a real anchor and a
            full page request. Styled with the same tokens Link uses so it does
            not read as a different control.
          */}
          <a
            href={`/api/projects/${project.id}/proposal.csv`}
            download
            className="text-sm font-medium text-ink underline underline-offset-4 hover:opacity-70"
          >
            Download spreadsheet
          </a>
          {project.status === 'confirmed' ? (
            <Link href={`/projects/${project.id}`} isStandalone>
              Approved — view project
            </Link>
          ) : (
            <ApproveButton id={project.id} />
          )}
        </div>
      </div>
    </div>
  );
}
