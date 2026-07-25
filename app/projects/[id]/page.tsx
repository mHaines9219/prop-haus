import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Banner } from '@astryxdesign/core/Banner';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { getProject, type VendorRequest } from '@/lib/projects';
import { SOURCE_META } from '@/lib/types';
import { CoiVendorPanel } from './coi-panel';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const PROJECT_STATUS: Record<string, BadgeVariant> = {
  submitted: 'neutral',
  quoting: 'warning',
  proposed: 'success',
  confirmed: 'info',
  cancelled: 'neutral',
};

const VENDOR_STATUS: Record<string, BadgeVariant> = {
  pending: 'neutral',
  partial: 'warning',
  responded: 'success',
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const totalItems = project.vendors.reduce((n, v) => n + v.items.length, 0);
  const respondedItems = project.vendors.reduce(
    (n, v) => n + v.items.filter((i) => i.status !== 'pending').length,
    0,
  );
  const coiVendors = project.vendors.filter((v) => v.coi.status !== 'not-required');
  const coiReady =
    coiVendors.length === 0 ||
    coiVendors.every((v) => v.coi.status === 'received' || v.coi.status === 'approved');
  const availabilityReady = project.status === 'confirmed' || project.status === 'proposed';

  return (
    <div className="max-w-4xl space-y-10">
      <div className="space-y-2">
        <Link href="/">← back to catalog</Link>
        <div className="flex items-baseline justify-between gap-4">
          <Heading level={1}>{project.productionName}</Heading>
          <Badge variant={PROJECT_STATUS[project.status] ?? 'neutral'} label={project.status} />
        </div>
        <Text color="secondary">
          #{project.id} · {project.productionType} · {project.startDate} → {project.endDate}
        </Text>
      </div>

      <section className="border-y border-ink/15 py-6">
        <MetadataList columns="multi">
          <MetadataListItem label="Contact">
            {project.contactName} · {project.contactEmail}
          </MetadataListItem>
          <MetadataListItem label="Phone">{project.contactPhone || '—'}</MetadataListItem>
          <MetadataListItem label="Delivery">{project.deliveryAddress}</MetadataListItem>
          <MetadataListItem label="Budget">{project.budget || '—'}</MetadataListItem>
          {project.insured?.policy && (
            <MetadataListItem label="Insured by">
              {project.insured.policy.carrier} · expires {project.insured.policy.expirationDate}
            </MetadataListItem>
          )}
          {project.notes && <MetadataListItem label="Notes">{project.notes}</MetadataListItem>}
        </MetadataList>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Heading level={2}>Vendor responses</Heading>
          <Text type="label" color="secondary">
            {respondedItems} / {totalItems} items answered
          </Text>
        </div>
        <div className="space-y-3">
          {project.vendors.map((v) => (
            <VendorRow key={v.token} v={v} />
          ))}
        </div>
      </section>

      {coiVendors.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Heading level={2}>COI readiness</Heading>
            <Text type="label" color="secondary">
              {coiReady ? 'all clear' : 'pending'}
            </Text>
          </div>
          <Text type="supporting" color="secondary">
            Each vendor that requires a certificate of insurance is tracked below.
          </Text>
          <div className="space-y-3">
            {coiVendors.map((v) => (
              <CoiVendorPanel
                key={v.token}
                projectId={project.id}
                vendor={v}
                insured={project.insured}
                productionName={project.productionName}
                startDate={project.startDate}
                endDate={project.endDate}
              />
            ))}
          </div>
        </section>
      )}

      {project.status === 'proposed' && (
        <Banner
          status="success"
          title="All vendors have responded"
          description="Review the consolidated proposal and approve."
          endContent={
            <Link href={`/projects/${project.id}/proposal`} isStandalone>
              View proposal →
            </Link>
          }
        />
      )}

      {project.status === 'confirmed' && (
        <Card>
          <div className="space-y-2">
            <Heading level={3}>Project confirmed</Heading>
            <Text color="secondary">
              Approved {project.approvedAt && new Date(project.approvedAt).toLocaleString()}.
            </Text>
            <div className="space-y-1 pt-2">
              <Text>{availabilityReady ? '✅' : '⬜'} Availability confirmed</Text>
              <Text>{coiReady ? '✅' : '⬜'} COIs received for all vendors</Text>
            </div>
            {!coiReady && (
              <Text type="supporting" color="secondary">
                Vendors typically won&rsquo;t release items until certs are in hand.
              </Text>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function VendorRow({ v }: { v: VendorRequest }) {
  const meta = SOURCE_META[v.vendor];
  const counts = v.items.reduce(
    (acc, i) => {
      acc[i.status] = (acc[i.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Text weight="medium">{meta?.name ?? v.vendor}</Text>
            <Text type="supporting" color="secondary">
              {v.items.length} item{v.items.length === 1 ? '' : 's'} ·{' '}
              {counts.available ? `${counts.available} available · ` : ''}
              {counts.sub ? `${counts.sub} sub · ` : ''}
              {counts.unavailable ? `${counts.unavailable} unavailable · ` : ''}
              {counts.pending ? `${counts.pending} pending` : v.status}
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={VENDOR_STATUS[v.status] ?? 'neutral'} label={v.status} />
            <Link href={`/vendor/${v.token}`} isStandalone>
              Vendor reply page →
            </Link>
          </div>
        </div>
        <Text type="supporting" color="secondary">
          (Demo: in production, this link is emailed only to the vendor.)
        </Text>
      </div>
    </Card>
  );
}
