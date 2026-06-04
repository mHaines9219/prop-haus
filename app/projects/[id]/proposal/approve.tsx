'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ApproveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      onClick={async () => {
        setPending(true);
        await fetch(`/api/projects/${id}/approve`, { method: 'POST' });
        router.push(`/projects/${id}`);
        router.refresh();
      }}
      disabled={pending}
      className="font-sans uppercase tracking-widest text-sm px-5 py-3 bg-ink text-paper hover:bg-accent transition disabled:opacity-50"
    >
      {pending ? 'Approving…' : 'Approve & confirm'}
    </button>
  );
}
