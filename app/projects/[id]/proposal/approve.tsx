'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
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
    <Button
      label={approve.isPending ? 'Approving…' : 'Approve & confirm'}
      variant="primary"
      isLoading={approve.isPending}
      isDisabled={approve.isPending}
      onClick={() => approve.mutate()}
    />
  );
}
