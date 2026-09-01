'use client';

import type { ReactNode } from 'react';
import type { Source } from '@/lib/types';

/**
 * A direct, attributed outbound vendor link that also fires a demand beacon —
 * MVP-6 emulate #1.
 *
 * The `href` is the real vendor URL (no proxy), so referrer attribution and
 * latency are untouched. On click we `navigator.sendBeacon` the item + vendor +
 * surface to `/api/events/outbound-click`; sendBeacon is queued by the browser
 * and survives the navigation that immediately follows, which a `fetch` would
 * not. Everything is best-effort: no beacon support, or a queue refusal, just
 * means one unrecorded click — never a blocked navigation.
 */
export function OutboundLink({
  href,
  itemId,
  source,
  surface,
  className,
  children,
}: {
  href: string;
  itemId: string;
  source: Source;
  surface: 'item_detail';
  className?: string;
  children: ReactNode;
}) {
  function beacon() {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
    try {
      const blob = new Blob([JSON.stringify({ itemId, source, surface })], {
        type: 'application/json',
      });
      navigator.sendBeacon('/api/events/outbound-click', blob);
    } catch {
      // A rejected beacon costs one demand data point, nothing the user sees.
    }
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} onClick={beacon}>
      {children}
    </a>
  );
}
