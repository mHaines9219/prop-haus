import { notFound } from 'next/navigation';
import { getProjectByToken } from '@/lib/projects';
import { SOURCE_META } from '@/lib/types';
import { VendorResponseForm } from './form';

export default async function VendorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = getProjectByToken(token);
  if (!result) notFound();
  const { project, vendor } = result;
  const meta = SOURCE_META[vendor.vendor];

  return (
    <div className="max-w-3xl space-y-8">
      <div className="border-l-4 border-accent pl-4">
        <p className="font-sans text-[10px] uppercase tracking-widest text-ink/50">
          Vendor reply page · {meta?.name ?? vendor.vendor}
        </p>
        <h1 className="font-display text-4xl mt-1">{project.productionName}</h1>
        <p className="font-sans text-sm text-ink/60 mt-1">
          Request #{project.id} · {project.startDate} → {project.endDate}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 border-y border-ink/15 py-5 font-sans text-sm">
        <div>
          <p className="uppercase text-[10px] tracking-widest text-ink/50">Production</p>
          <p>
            {project.productionType} · {project.contactName}
          </p>
        </div>
        <div>
          <p className="uppercase text-[10px] tracking-widest text-ink/50">Delivery</p>
          <p>{project.deliveryAddress}</p>
        </div>
        <div>
          <p className="uppercase text-[10px] tracking-widest text-ink/50">Contact</p>
          <p>
            {project.contactEmail}
            {project.contactPhone && ` · ${project.contactPhone}`}
          </p>
        </div>
        <div>
          <p className="uppercase text-[10px] tracking-widest text-ink/50">Budget</p>
          <p>{project.budget || '—'}</p>
        </div>
        {project.notes && (
          <div className="col-span-2">
            <p className="uppercase text-[10px] tracking-widest text-ink/50">Notes</p>
            <p>{project.notes}</p>
          </div>
        )}
      </section>

      <VendorResponseForm token={vendor.token} items={vendor.items} />
    </div>
  );
}
