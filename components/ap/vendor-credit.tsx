'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useEntitled } from '@/lib/plan-view';
import type { Source } from '@/lib/types';
import { OutboundLink } from './outbound-link';

/**
 * The three places the directory prints which house holds a piece. Each reads
 * the plan from PlanContext (lib/plan-view.tsx): the Browse tier sees the
 * piece, not the house (lib/pricing.ts), so the name is withheld and the
 * item page says where it is listed instead. While the plan is unknown the
 * slot stays empty rather than flashing one answer and then the other.
 */

/** The card's bottom-left credit line (ItemCard). */
export function VendorLine({ name, className }: { name: string; className?: string }) {
  const entitled = useEntitled('vendorIdentity');
  if (entitled === null) return <p className={className} aria-hidden />;
  return (
    <p className={className}>
      {entitled ? name : <span className="text-text-disabled">Prop house withheld</span>}
    </p>
  );
}

/** A bare vendor name inside a spec row or a listing line; "Withheld" on Browse. */
export function VendorName({ name }: { name: string }) {
  const entitled = useEntitled('vendorIdentity');
  if (entitled === null) return null;
  return <>{entitled ? name : 'Withheld'}</>;
}

/** The item page's "Courtesy of" line. */
export function VendorCredit({ name, className }: { name: string; className?: string }) {
  const entitled = useEntitled('vendorIdentity');
  if (entitled === null) return <p className={className} aria-hidden />;
  return (
    <p className={className}>
      {entitled ? `Courtesy of ${name}` : 'Prop house withheld on the Browse plan'}
    </p>
  );
}

/** The item page's outbound button, or where to find the house instead. */
export function VendorOutbound({
  name,
  href,
  itemId,
  source,
  className,
}: {
  name: string;
  href: string;
  itemId: string;
  source: Source;
  className?: string;
}) {
  const entitled = useEntitled('vendorIdentity');
  if (entitled === null) return null;
  if (!entitled) {
    return (
      <p className="border-y border-border py-3 text-[13px] leading-[19px] text-text-secondary">
        The house holding this piece is listed on Directory.{' '}
        <Link href="/pricing" className="ink-underline text-accent-text">
          See rates
        </Link>
      </p>
    );
  }
  return (
    <OutboundLink href={href} itemId={itemId} source={source} surface="item_detail" className={className}>
      View on {name}
      <ExternalLink size={16} strokeWidth={1.5} aria-hidden />
    </OutboundLink>
  );
}
