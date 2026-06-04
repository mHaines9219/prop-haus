import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { SOURCE_META } from '@/lib/types';
import { ApproveButton } from './approve';

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
    <div className="space-y-10 max-w-4xl">
      <div className="space-y-2">
        <Link
          href={`/projects/${project.id}`}
          className="font-sans text-xs uppercase tracking-widest text-ink/50"
        >
          ← back to project
        </Link>
        <h1 className="font-display text-4xl">Consolidated proposal</h1>
        <p className="font-sans text-sm text-ink/60">
          {project.productionName} · #{project.id} · {project.startDate} → {project.endDate}
        </p>
      </div>

      <div className="space-y-6">
        {vendorTotals.map(({ vendor: v, subtotal }) => {
          const meta = SOURCE_META[v.vendor];
          return (
            <div key={v.token} className="border border-ink/15 p-5">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-display text-xl">{meta?.name ?? v.vendor}</h2>
                <span className="font-sans text-sm">
                  Subtotal: <strong>${subtotal.toFixed(2)}</strong>
                </span>
              </div>
              <ul className="divide-y divide-ink/10 font-sans text-sm">
                {v.items.map((i) => (
                  <li key={i.itemId} className="py-3 flex items-start gap-3">
                    {i.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image} alt="" className="w-14 h-14 object-cover bg-ink/5 shrink-0" />
                    ) : (
                      <div className="w-14 h-14 bg-ink/10 shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span>
                          {i.name}{' '}
                          <span className="text-ink/50">×{i.qty}</span>
                        </span>
                        <LineBadge status={i.status} />
                      </div>
                      {i.subNote && (
                        <p className="text-xs text-amber-800 mt-1">Sub: {i.subNote}</p>
                      )}
                      {i.priceQuote !== undefined && (i.status === 'available' || i.status === 'sub') && (
                        <p className="text-xs text-ink/60 mt-1">
                          ${i.priceQuote.toFixed(2)} × {i.qty} = $
                          {(i.priceQuote * i.qty).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-ink/30 pt-6 flex items-center justify-between">
        <div>
          <p className="font-sans text-xs uppercase tracking-widest text-ink/50">Grand total (estimate)</p>
          <p className="font-display text-3xl">${grandTotal.toFixed(2)}</p>
        </div>
        {project.status === 'confirmed' ? (
          <Link
            href={`/projects/${project.id}`}
            className="font-sans uppercase tracking-widest text-sm px-5 py-3 border border-ink/40"
          >
            Approved — view project
          </Link>
        ) : (
          <ApproveButton id={project.id} />
        )}
      </div>
    </div>
  );
}

function LineBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: 'bg-emerald-100 text-emerald-900',
    sub: 'bg-amber-100 text-amber-900',
    unavailable: 'bg-ink/10 text-ink/60 line-through',
    pending: 'bg-ink/10 text-ink/60',
  };
  return (
    <span className={`uppercase tracking-widest text-[10px] px-2 py-0.5 ${map[status] ?? ''}`}>{status}</span>
  );
}
