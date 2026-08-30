'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { deleteJson } from '@/lib/api';

export function RemoveItemButton({ projectId, itemId }: { projectId: string; itemId: string }) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () =>
      deleteJson(`/api/projects/${projectId}/items?itemId=${encodeURIComponent(itemId)}`),
    onSuccess: () => router.refresh(),
  });

  return (
    <Button
      label="Remove"
      size="sm"
      variant="ghost"
      isDisabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    />
  );
}
