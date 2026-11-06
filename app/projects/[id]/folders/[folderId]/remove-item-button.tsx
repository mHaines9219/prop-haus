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
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors duration-150 hover:text-accent-text disabled:opacity-40"
      >
        Remove
      </button>
      {mutation.isError && (
        <span role="alert" className="font-mono text-[11px] text-destructive">
          Couldn’t remove. Try again.
        </span>
      )}
    </span>
  );
}
