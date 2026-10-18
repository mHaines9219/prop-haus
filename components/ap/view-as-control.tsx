'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlanTier } from '@/lib/accounts';
import { postJson } from '@/lib/api';
import { usePlanView, type PlanView } from '@/lib/plan-view';
import { PRICING_TIERS, tierName } from '@/lib/pricing';
import { cn } from '@/lib/utils';

/**
 * The admin's masquerade: a cream index tab in the nav reading VIEW AS, over
 * a native select of the three rate-card tiers plus "my plan". Renders
 * nothing for everyone else. Picking a tier writes the view-as cookie, then
 * refreshes the server tree and the client's /api/me and usage queries, so
 * the allowance line, the paperwork gates and every vendor credit on the
 * page re-read as that tier would see them.
 */
const OWN = 'own';

export function ViewAsControl({ className }: { className?: string }) {
  const view = usePlanView();
  // The select needs the query client and the router; members never mount it,
  // so a nav rendered without those providers still prints.
  if (view.status !== 'ready' || !view.isAdmin) return null;
  return <ViewAsSelect view={view} className={className} />;
}

function ViewAsSelect({ view, className }: { view: PlanView; className?: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const masquerading = view.plan !== view.actualPlan;
  const value = masquerading ? view.plan : OWN;

  async function pick(next: string) {
    setBusy(true);
    setError(false);
    try {
      await postJson('/api/admin/view-as', { plan: next === OWN ? null : (next as PlanTier) });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['usage'] });
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span
      data-busy={busy || undefined}
      title={error ? 'The view did not switch. Try again.' : undefined}
      className={cn(
        'relative hidden items-stretch border-[1.5px] border-ink bg-paper-lit text-ink data-[busy]:opacity-60 sm:inline-flex',
        masquerading && 'bg-accent',
        className,
      )}
    >
      <span
        aria-hidden
        className="flex items-center border-r-[1.5px] border-ink px-2 font-heading text-[10px] font-extrabold uppercase leading-none tracking-[0.1em]"
      >
        View as
      </span>
      <select
        aria-label="View the site as a plan tier"
        value={value}
        disabled={busy}
        onChange={(e) => void pick(e.target.value)}
        className="h-[26px] cursor-pointer appearance-none bg-transparent pl-2 pr-6 font-heading text-[12px] font-extrabold uppercase leading-none tracking-[0.04em] text-jet outline-none disabled:cursor-wait"
      >
        <option value={OWN}>My plan · {tierName(view.actualPlan)}</option>
        {PRICING_TIERS.map((t) => (
          <option key={t.plan} value={t.plan}>
            {t.name}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden size={13} strokeWidth={2} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-jet" />
    </span>
  );
}
