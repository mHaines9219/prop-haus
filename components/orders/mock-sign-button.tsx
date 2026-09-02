'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** The mock provider's stand-in for the Anvil signing frame: one click marks the document signed. */
export function MockSignButton({ orderId, documentId }: { orderId: string; documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/forms/${documentId}/mock-sign`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'The signature did not go through. Try again.');
        return;
      }
      router.push(`/orders/${orderId}`);
      router.refresh();
    } catch {
      setError('The signature did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={sign}
        className="rounded-md bg-accent px-5 py-3 font-mono text-[13px] font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Signing' : 'Sign as the ordering contact'}
      </button>
      {error && <p className="mt-3 border-l-2 border-destructive pl-3 font-mono text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
