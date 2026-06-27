'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/api';

export function ApproveButton({ id }: { id: string }) {
  const router = useRouter();
  const approve = useMutation({
    mutationFn: () => postJson(`/api/projects/${id}/approve`, {}),
    onSuccess: () => {
      router.push(`/projects/${id}`);
      router.refresh();
    },
  });
  return (
    <button
      onClick={() => approve.mutate()}
      disabled={approve.isPending}
      className="font-sans uppercase tracking-widest text-sm px-5 py-3 bg-ink text-paper hover:bg-accent transition disabled:opacity-50"
    >
      {approve.isPending ? 'Approving…' : 'Approve & confirm'}
    </button>
  );
}
