import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { getProjectByToken } from '@/lib/projects';
import { SOURCE_META } from '@/lib/types';
import { VendorResponseForm } from './form';

export default async function VendorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getProjectByToken(token);
  if (!result) notFound();
  const { project, vendor } = result;
  const meta = SOURCE_META[vendor.vendor];

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-1 border-l-4 border-accent pl-4">
        <Text type="label" color="secondary">
          Vendor reply page · {meta?.name ?? vendor.vendor}
        </Text>
        <Heading level={1}>{project.productionName}</Heading>
        <Text color="secondary">
          Request #{project.id} · {project.startDate} → {project.endDate}
        </Text>
      </div>

      <section className="border-y border-ink/15 py-5">
        <MetadataList columns="multi">
          <MetadataListItem label="Production">
            {project.productionType} · {project.contactName}
          </MetadataListItem>
          <MetadataListItem label="Delivery">{project.deliveryAddress}</MetadataListItem>
          <MetadataListItem label="Contact">
            {project.contactEmail}
            {project.contactPhone && ` · ${project.contactPhone}`}
          </MetadataListItem>
          <MetadataListItem label="Budget">{project.budget || '—'}</MetadataListItem>
          {project.notes && <MetadataListItem label="Notes">{project.notes}</MetadataListItem>}
        </MetadataList>
      </section>

      <VendorResponseForm
        token={vendor.token}
        items={vendor.items}
        startDate={project.startDate}
        endDate={project.endDate}
      />
    </div>
  );
}
