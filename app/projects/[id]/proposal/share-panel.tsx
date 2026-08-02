'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { postJson } from '@/lib/api';

/**
 * Create or revoke the client-facing link for this proposal.
 *
 * Deliberately plain about what the link does. A production is handing out a
 * document containing their budget and their vendors, so the control says who
 * can see it and that it can be taken back, rather than only "Share".
 */
export function SharePanel({
  projectId,
  initialShareUrl,
}: {
  projectId: string;
  initialShareUrl: string | null;
}) {
  const router = useRouter();
  const [shareUrl, setShareUrl] = useState<string | null>(initialShareUrl);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: (shared: boolean) =>
      postJson<{ shareUrl: string | null }>(`/api/projects/${projectId}/share`, { shared }),
    onSuccess: (data) => {
      setShareUrl(data.shareUrl);
      setCopied(false);
      router.refresh();
    },
  });

  // Absolute, because the whole point is pasting it into an email. Built in the
  // browser rather than on the server so it carries whatever origin the app is
  // actually being used on, rather than a origin baked in at build time.
  const absolute = shareUrl ? `${window.location.origin}${shareUrl}` : null;

  async function copy() {
    if (!absolute) return;
    await navigator.clipboard.writeText(absolute);
    setCopied(true);
  }

  return (
    <Card>
      <div className="space-y-3">
        <div>
          <Text weight="medium">Client link</Text>
          <Text type="supporting" color="secondary">
            {shareUrl
              ? 'Anyone with this link can view and download this proposal. They cannot approve it or see the rest of your jobs.'
              : 'Create a link to send this proposal to a client. You can revoke it at any time.'}
          </Text>
        </div>

        {absolute && (
          <div className="flex items-center gap-2 border border-ink/15 px-3 py-2">
            {/*
              Plain selectable text rather than a TextInput: the design system has
              no read-only variant, and `isDisabled` would dim the value and make
              it awkward to select — the opposite of what a copyable link needs.
            */}
            <Text as="span" className="flex-1 truncate font-mono">
              {absolute}
            </Text>
            <Button
              label={copied ? 'Copied' : 'Copy'}
              variant="secondary"
              size="sm"
              onClick={copy}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          {shareUrl ? (
            <Button
              label="Revoke link"
              variant="secondary"
              size="sm"
              isDisabled={mutation.isPending}
              onClick={() => mutation.mutate(false)}
            />
          ) : (
            <Button
              label="Create client link"
              variant="primary"
              size="sm"
              isDisabled={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            />
          )}
          {mutation.isError && (
            <Text color="secondary">Could not update the link. Try again.</Text>
          )}
        </div>
      </div>
    </Card>
  );
}
