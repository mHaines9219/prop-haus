'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
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
    <Button
      label={isArchived ? 'Restore' : 'Archive'}
      size="sm"
      variant="secondary"
      isDisabled={mutation.isPending}
      // The row itself is a link; without this the click would also navigate.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate(!isArchived);
      }}
    />
  );
}
