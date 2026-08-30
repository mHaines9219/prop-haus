import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getOrderById } from '@/lib/orders';
import { requireOrgId } from '@/lib/session';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';

type Props = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<string, string> = {
  placed:     'Placed',
  processing: 'Processing',
  confirmed:  'Confirmed',
  cancelled:  'Cancelled',
};

export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  const orgId = await requireOrgId(`/orders/${id}`);

  let order;
  try {
    order = await getOrderById(id, orgId);
  } catch {
    notFound();
  }

  const vendorCount = new Set(order.items.map((i) => i.vendor)).size;
  const placedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">

          {/* Header */}
          <div className="mb-10">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Order confirmed
            </p>
            <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
              #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[13px] text-text-secondary">
              <span>{placedDate}</span>
              <span className="text-text-tertiary">·</span>
              <span>
                {order.items.length} item{order.items.length !== 1 ? 's' : ''} from{' '}
                {vendorCount} vendor{vendorCount !== 1 ? 's' : ''}
              </span>
              <span className="text-text-tertiary">·</span>
              <span className="uppercase tracking-[0.06em]">
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            </div>
          </div>

          {/* Rental window */}
          {(order.rentalStart || order.rentalEnd) && (
            <div className="mb-8 rounded-md border border-border bg-surface-raised p-5">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary mb-4">
                Rental window
              </p>
              <div className="flex flex-wrap gap-8 font-mono text-[13px]">
                {order.rentalStart && (
                  <div>
                    <p className="text-text-tertiary">Start</p>
                    <p className="mt-1 font-medium">{order.rentalStart}</p>
                  </div>
                )}
                {order.rentalEnd && (
                  <div>
                    <p className="text-text-tertiary">End</p>
                    <p className="mt-1 font-medium">{order.rentalEnd}</p>
                  </div>
                )}
              </div>
              {order.deliveryNotes && (
                <p className="mt-4 font-mono text-[12px] text-text-secondary">{order.deliveryNotes}</p>
              )}
            </div>
          )}

          {/* Items */}
          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-4 py-5">
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      width={96}
                      height={96}
                      className="h-24 w-24 object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="block h-24 w-24 bg-surface-raised" />
                  )}
                </a>
                <div className="py-0.5">
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium leading-snug hover:underline"
                  >
                    {item.name}
                  </a>
                  <p className="mt-1 font-mono text-[12px] text-text-tertiary">{item.vendor}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div className="mt-10 flex gap-3">
            <Link
              href="/orders"
              className="rounded-md border border-border px-4 py-2.5 font-mono text-[13px] text-foreground transition-colors hover:bg-surface-raised"
            >
              All orders
            </Link>
            <Link
              href="/"
              className="rounded-md border border-green-500 px-4 py-2.5 font-mono text-[13px] text-green-500 transition-colors hover:bg-green-500 hover:text-background"
            >
              Browse catalog
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
