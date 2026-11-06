'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/api';
import { usePlanView } from '@/lib/plan-view';
import { cn } from '@/lib/utils';

/**
 * The sandbox switch: an index tab pinned to the corner of every page, for
 * admins only. On, the next order this admin places is a sandbox order:
 * nothing is sent, the card is a test card, and each house's booking is
 * advanced by hand from the order page. Renders nothing for everyone else.
 */
export function SandboxToggle() {
  const view = usePlanView();
  // The switch needs the query client and the router; members never mount it.
  if (view.status !== 'ready' || !view.isAdmin) return null;
  return <SandboxSwitch on={view.sandbox} />;
}

function SandboxSwitch({ on }: { on: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function flip() {
    setBusy(true);
    setError(false);
    try {
      await postJson('/api/admin/sandbox', { on: !on });
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Sandbox mode"
      disabled={busy}
      onClick={() => void flip()}
      title={
        error
          ? 'The switch did not flip. Try again.'
          : on
            ? 'Sandbox is on. Orders you place send nothing and advance by hand.'
            : 'Sandbox is off. Turn it on to test the booking flow without sending anything.'
      }
      className="fixed bottom-4 right-4 z-50 inline-flex items-stretch border-[1.5px] border-ink bg-paper-lit text-ink lift-sm disabled:cursor-wait disabled:opacity-60"
    >
      <span className="flex items-center border-r-[1.5px] border-ink px-2 font-heading text-[10px] font-extrabold uppercase leading-none tracking-[0.1em]">
        Sandbox
      </span>
      <span
        className={cn(
          'flex h-[26px] min-w-[38px] items-center justify-center px-2 font-heading text-[12px] font-extrabold uppercase leading-none tracking-[0.04em]',
          on && 'bg-accent text-jet',
        )}
      >
        {on ? 'On' : 'Off'}
      </span>
    </button>
  );
}
