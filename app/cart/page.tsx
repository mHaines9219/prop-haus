'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { List } from '@astryxdesign/core/List';
import { Item } from '@astryxdesign/core/Item';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useCart } from '@/lib/cart-store';
import { getJson, postJson } from '@/lib/api';
import { SOURCE_META, type Source } from '@/lib/types';

type ProjectSummary = { id: string; name: string; itemCount: number };

export default function CartPage() {
  const router = useRouter();
  const { lines, remove, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => getJson<{ projects: ProjectSummary[] }>('/api/projects'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const items = lines.map((l) => ({
        itemId: l.item.id,
        source: l.item.source,
        sourceId: l.item.sourceId,
        name: l.item.name,
        image: l.item.images[0],
        sourceUrl: l.item.sourceUrl,
        category: l.item.category,
      }));

      if (projectId) {
        await postJson(`/api/projects/${projectId}/items`, { items });
        return projectId;
      }
      const { id } = await postJson<{ id: string }>('/api/projects', {
        name: newFolderName.trim(),
        items,
      });
      return id;
    },
    onSuccess: (id) => {
      clear();
      router.push(`/projects/${id}`);
    },
  });

  const vendorSources = Array.from(new Set(lines.map((l) => l.item.source))) as Source[];
  const canSave = Boolean(projectId || newFolderName.trim());

  if (!mounted) return <Text color="secondary">Loading…</Text>;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse the catalog and add pieces from any vendor to save them into a folder."
        actions={<Button label="Browse catalog" variant="primary" onClick={() => router.push('/')} />}
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <Heading level={1}>Cart</Heading>

      <List hasDividers>
        {lines.map((line) => {
          const href = `/item/${line.item.source}/${encodeURIComponent(line.item.sourceId)}`;
          return (
            <Item
              as="li"
              key={line.item.id}
              startContent={
                <Link href={href}>
                  {line.item.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.item.images[0]}
                      alt={line.item.name}
                      className="h-20 w-20 object-cover"
                    />
                  ) : (
                    <span className="block h-20 w-20 bg-muted" />
                  )}
                </Link>
              }
              label={<Link href={href}>{line.item.name}</Link>}
              description={SOURCE_META[line.item.source]?.name ?? line.item.source}
              endContent={
                <Button
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(line.item.id)}
                />
              }
            />
          );
        })}
      </List>

      <Card>
        <div className="space-y-4">
          <Heading level={2}>Save to a folder</Heading>
          <Text type="supporting" color="secondary">
            Pick an existing folder or start a new one — you can review everything you&rsquo;ve
            saved and click through to each vendor from there.
          </Text>
          <Selector
            label="Existing folder"
            placeholder="Choose a folder"
            hasClear
            options={(projects.data?.projects ?? []).map((p) => ({
              value: p.id,
              label: `${p.name} (${p.itemCount})`,
            }))}
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              if (v) setNewFolderName('');
            }}
          />
          <TextInput
            label="Or start a new folder"
            placeholder="e.g. Fall commercial — living room"
            value={newFolderName}
            onChange={(v) => {
              setNewFolderName(v);
              if (v) setProjectId(null);
            }}
          />
        </div>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button label="Clear cart" variant="ghost" size="sm" onClick={clear} />
        <div className="flex flex-col items-end gap-2">
          <Text type="supporting" color="secondary">
            {lines.length} item{lines.length === 1 ? '' : 's'} · {vendorSources.length} vendor
            {vendorSources.length === 1 ? '' : 's'}
          </Text>
          <Button
            label={save.isPending ? 'Saving…' : 'Save to folder'}
            variant="primary"
            isDisabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          />
        </div>
      </div>
    </div>
  );
}
