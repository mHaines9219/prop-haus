'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/api';

export function ArchiveButton({
  projectId,
  isArchived,
}: {
  projectId: string;
  isArchived: boolean;
}) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (archived: boolean) =>
      postJson(`/api/projects/${projectId}/archive`, { archived }),
    onSuccess: () => router.refresh(),
  });

  return (
    <button
      type="button"
      disabled={mutation.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate(!isArchived);
      }}
      className="h-8 rounded-sm border border-border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-foreground disabled:opacity-40"
    >
      {isArchived ? 'Restore' : 'Archive'}
    </button>
  );
}
