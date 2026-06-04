'use client';

import type { CompatibilityResult } from '@/lib/insurance';

export function CoiBadge({ result }: { result: CompatibilityResult }) {
  const styles: Record<CompatibilityResult['status'], string> = {
    ok: 'bg-emerald-100 text-emerald-900',
    warning: 'bg-amber-100 text-amber-900',
    gap: 'bg-rose-100 text-rose-900',
    'no-policy': 'bg-ink/10 text-ink/60',
    'not-required': 'bg-ink/5 text-ink/50',
  };
  const label: Record<CompatibilityResult['status'], string> = {
    ok: '✓ Insurance OK',
    warning: '⚠ Warning',
    gap: '⚠ Coverage gap',
    'no-policy': 'Add insurance',
    'not-required': 'No COI needed',
  };
  return (
    <span
      className={`font-sans uppercase tracking-widest text-[10px] px-2 py-1 ${styles[result.status]}`}
    >
      {label[result.status]}
    </span>
  );
}
