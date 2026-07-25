'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { postJson } from '@/lib/api';
import type { LineItem, LineStatus } from '@/lib/projects';

type UpdateVars = { itemId: string; status: LineStatus; priceQuote?: number; subNote?: string };

export function VendorResponseForm({ token, items }: { token: string; items: LineItem[] }) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (vars: UpdateVars) => postJson(`/api/vendor/${token}`, vars),
    onSuccess: () => router.refresh(),
  });

  const update = (
    item: LineItem,
    status: LineStatus,
    extra: { priceQuote?: number; subNote?: string } = {},
  ) => mutation.mutate({ itemId: item.itemId, status, ...extra });

  return (
    <section className="space-y-4">
      <Heading level={2}>Items requested</Heading>
      <ul className="divide-y divide-ink/15 border-y border-ink/15">
        {items.map((item) => (
          <ItemRow
            key={item.itemId}
            item={item}
            pending={mutation.isPending && mutation.variables?.itemId === item.itemId}
            onUpdate={update}
          />
        ))}
      </ul>
      <Text type="supporting" color="secondary">
        Click a status to record your response. Updates are saved immediately.
      </Text>
    </section>
  );
}

function ItemRow({
  item,
  pending,
  onUpdate,
}: {
  item: LineItem;
  pending: boolean;
  onUpdate: (
    item: LineItem,
    status: LineStatus,
    extra?: { priceQuote?: number; subNote?: string },
  ) => void;
}) {
  const [price, setPrice] = useState<string>(item.priceQuote?.toString() ?? '');
  const [subNote, setSubNote] = useState<string>(item.subNote ?? '');
  const priceNum = price ? Number(price) : undefined;

  return (
    <li className="flex gap-4 py-4">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-24 w-24 shrink-0 object-cover" />
      ) : (
        <span className="block h-24 w-24 shrink-0 bg-muted" />
      )}
      <div className="flex-1 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <Text weight="medium">{item.name}</Text>
          <Text type="label" color="secondary">
            qty {item.qty}
          </Text>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            label="Available"
            size="sm"
            variant={item.status === 'available' ? 'primary' : 'secondary'}
            isDisabled={pending}
            onClick={() => onUpdate(item, 'available', { priceQuote: priceNum })}
          />
          <Button
            label="Substitution"
            size="sm"
            variant={item.status === 'sub' ? 'primary' : 'secondary'}
            isDisabled={pending}
            onClick={() => onUpdate(item, 'sub', { subNote: subNote || undefined, priceQuote: priceNum })}
          />
          <Button
            label="Unavailable"
            size="sm"
            variant={item.status === 'unavailable' ? 'primary' : 'secondary'}
            isDisabled={pending}
            onClick={() => onUpdate(item, 'unavailable')}
          />
          <div className="w-32">
            <NumberInput
              label="Price quote"
              isLabelHidden
              size="sm"
              placeholder="Price quote"
              value={priceNum}
              onChange={(v) => setPrice(v ? String(v) : '')}
            />
          </div>
          {item.status === 'sub' && (
            <div className="min-w-[10rem] flex-1">
              <TextInput
                label="Substitution note"
                isLabelHidden
                size="sm"
                placeholder="Substitution note"
                value={subNote}
                onChange={(v) => setSubNote(v)}
              />
            </div>
          )}
        </div>

        {item.priceQuote !== undefined && (
          <Text type="supporting" color="secondary">
            Quoted: ${item.priceQuote.toFixed(2)} {item.subNote && `· ${item.subNote}`}
          </Text>
        )}
      </div>
    </li>
  );
}
