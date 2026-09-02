'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { deleteJson } from '@/lib/api';

export function RemoveItemButton({
  projectId,
  folderId,
  itemId,
}: {
  projectId: string;
  folderId: string;
  itemId: string;
}) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () =>
      deleteJson(
        `/api/projects/${projectId}/folders/${folderId}/items?itemId=${encodeURIComponent(itemId)}`,
      ),
    onSuccess: () => router.refresh(),
  });

  return (
    <button
      type="button"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors duration-150 hover:text-green-500 disabled:opacity-40"
    >
      Remove
    </button>
  );
}
