'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { deleteJson } from '@/lib/api';

export function RemoveDocumentButton({
  projectId,
  folderId,
  documentId,
  name,
}: {
  projectId: string;
  folderId: string;
  documentId: string;
  name: string;
}) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () =>
      deleteJson(
        `/api/projects/${projectId}/folders/${folderId}/documents?documentId=${encodeURIComponent(documentId)}`,
      ),
    onSuccess: () => router.refresh(),
  });

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => {
          if (window.confirm(`Remove “${name}” from paperwork? This deletes the file.`)) {
            mutation.mutate();
          }
        }}
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
