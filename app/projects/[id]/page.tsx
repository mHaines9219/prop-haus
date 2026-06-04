import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject, type VendorRequest } from '@/lib/projects';
import { SOURCE_META } from '@/lib/types';
import { CoiVendorPanel } from './coi-panel';

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
    <div className="space-y-10 max-w-4xl">
      <div className="space-y-2">
        <Link href="/" className="font-sans text-xs uppercase tracking-widest text-ink/50">
          ← back to catalog
        </Link>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-4xl">{project.productionName}</h1>
          <StatusPill status={project.status} />
        </div>
        <p className="font-sans text-sm text-ink/60">
          #{project.id} · {project.productionType} · {project.startDate} → {project.endDate}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-6 border-y border-ink/15 py-6 font-sans text-sm">
        <Detail label="Contact" value={`${project.contactName} · ${project.contactEmail}`} />
        <Detail label="Phone" value={project.contactPhone || '—'} />
        <Detail label="Delivery" value={project.deliveryAddress} />
        <Detail label="Budget" value={project.budget || '—'} />
        {project.insured?.policy && (
          <Detail
            label="Insured by"
            value={`${project.insured.policy.carrier} · expires ${project.insured.policy.expirationDate}`}
            className="col-span-2"
          />
        )}
        {project.notes && <Detail label="Notes" value={project.notes} className="col-span-2" />}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Vendor responses</h2>
          <span className="font-sans text-xs uppercase tracking-widest text-ink/50">
            {respondedItems} / {totalItems} items answered
          </span>
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
            <h2 className="font-display text-2xl">COI readiness</h2>
            <span className="font-sans text-xs uppercase tracking-widest text-ink/50">
              {coiReady ? 'all clear' : 'pending'}
            </span>
          </div>
          <p className="font-sans text-xs text-ink/60">
            Each vendor that requires a certificate of insurance is tracked below.
          </p>
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
        <div className="border border-accent/40 bg-accent/5 p-6 flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl">All vendors have responded</h3>
            <p className="font-sans text-sm text-ink/70">Review the consolidated proposal and approve.</p>
          </div>
          <Link
            href={`/projects/${project.id}/proposal`}
            className="font-sans uppercase tracking-widest text-sm px-5 py-3 bg-ink text-paper hover:bg-accent transition"
          >
            View proposal
          </Link>
        </div>
      )}

      {project.status === 'confirmed' && (
        <div className="border border-ink/20 bg-ink/5 p-6 space-y-2">
          <h3 className="font-display text-xl">Project confirmed</h3>
          <p className="font-sans text-sm text-ink/70">
            Approved {project.approvedAt && new Date(project.approvedAt).toLocaleString()}.
          </p>
          <ul className="font-sans text-sm space-y-1 pt-2">
            <li>{availabilityReady ? '✅' : '⬜'} Availability confirmed</li>
            <li>{coiReady ? '✅' : '⬜'} COIs received for all vendors</li>
          </ul>
          {!coiReady && (
            <p className="font-sans text-xs text-ink/60 pt-1">
              Vendors typically won&rsquo;t release items until certs are in hand.
            </p>
          )}
        </div>
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
    <div className="border border-ink/15 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-lg">{meta?.name ?? v.vendor}</p>
          <p className="font-sans text-xs uppercase tracking-widest text-ink/50">
            {v.items.length} item{v.items.length === 1 ? '' : 's'} ·{' '}
            {counts.available ? `${counts.available} available · ` : ''}
            {counts.sub ? `${counts.sub} sub · ` : ''}
            {counts.unavailable ? `${counts.unavailable} unavailable · ` : ''}
            {counts.pending ? `${counts.pending} pending` : v.status}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <VendorStatusPill status={v.status} />
          <Link
            href={`/vendor/${v.token}`}
            className="font-sans text-xs uppercase tracking-widest border border-ink/40 px-3 py-2 hover:bg-ink hover:text-paper transition"
          >
            Vendor reply page →
          </Link>
        </div>
      </div>
      <p className="font-sans text-[10px] uppercase tracking-widest text-ink/40 mt-3">
        (Demo: in production, this link is emailed only to the vendor.)
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted: 'bg-ink/10 text-ink',
    quoting: 'bg-amber-100 text-amber-900',
    proposed: 'bg-emerald-100 text-emerald-900',
    confirmed: 'bg-ink text-paper',
    cancelled: 'bg-ink/20 text-ink/60',
  };
  return (
    <span
      className={`font-sans uppercase tracking-widest text-[10px] px-2 py-1 ${map[status] ?? 'bg-ink/10'}`}
    >
      {status}
    </span>
  );
}

function VendorStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-ink/10 text-ink/70',
    partial: 'bg-amber-100 text-amber-900',
    responded: 'bg-emerald-100 text-emerald-900',
  };
  return (
    <span
      className={`font-sans uppercase tracking-widest text-[10px] px-2 py-1 ${map[status] ?? 'bg-ink/10'}`}
    >
      {status}
    </span>
  );
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="uppercase text-[10px] tracking-widest text-ink/50">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
