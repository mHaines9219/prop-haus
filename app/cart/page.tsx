'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { List, ListItem } from '@astryxdesign/core/List';
import { Item } from '@astryxdesign/core/Item';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useCart } from '@/lib/cart-store';
import { useProfile } from '@/lib/profile-store';
import { checkCompatibility } from '@/lib/insurance';
import { SOURCE_META, type Source } from '@/lib/types';
import { CoiBadge } from '@/components/coi-badge';

export default function CartPage() {
  const router = useRouter();
  const { lines, remove, setQty, startDate, endDate, setDates, clear } = useCart();
  const { profile } = useProfile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const vendorSources = Array.from(new Set(lines.map((l) => l.item.source))) as Source[];
  const vendorCount = vendorSources.length;
  const shootDates = startDate && endDate ? { start: startDate, end: endDate } : null;
  const compat = vendorSources.map((src) => ({
    source: src,
    result: checkCompatibility(profile?.policy, src, shootDates),
  }));
  const hasGap = compat.some((c) => c.result.status === 'gap');

  if (!mounted) return <Text color="secondary">Loading…</Text>;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse the catalog and add pieces from any vendor to start a quote request."
        actions={<Button label="Browse catalog" variant="primary" onClick={() => router.push('/')} />}
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <Heading level={1}>Quote Request</Heading>

      <div className="grid grid-cols-2 gap-4">
        <DateInput
          label="Start date"
          value={(startDate ?? undefined) as ISODateString | undefined}
          onChange={(v) => setDates(v ?? null, endDate)}
        />
        <DateInput
          label="End date"
          value={(endDate ?? undefined) as ISODateString | undefined}
          onChange={(v) => setDates(startDate, v ?? null)}
        />
      </div>

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
                <div className="flex items-center gap-3">
                  <div className="w-24">
                    <NumberInput
                      label="Quantity"
                      isLabelHidden
                      size="sm"
                      min={1}
                      isIntegerOnly
                      value={line.qty}
                      onChange={(v) => setQty(line.item.id, v)}
                    />
                  </div>
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(line.item.id)}
                  />
                </div>
              }
            />
          );
        })}
      </List>

      <Card>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <Heading level={2}>Insurance check</Heading>
            <Link href="/onboarding/insurance?next=/cart">
              {profile?.policy ? 'Edit' : 'Add insurance'}
            </Link>
          </div>
          {!profile?.policy && (
            <Text type="supporting" color="secondary">
              Add your business policy once and we&rsquo;ll check every vendor against your coverage.
            </Text>
          )}
          <List hasDividers>
            {compat.map(({ source, result }) => (
              <ListItem
                key={source}
                label={SOURCE_META[source]?.name ?? source}
                endContent={
                  <div className="flex items-center gap-3">
                    {result.issues.length > 0 && (
                      <Text type="supporting" color="secondary">
                        {result.issues
                          .slice(0, 2)
                          .map((i) => i.field)
                          .join(', ')}
                        {result.issues.length > 2 && ` +${result.issues.length - 2}`}
                      </Text>
                    )}
                    <CoiBadge result={result} />
                  </div>
                }
              />
            ))}
          </List>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button label="Clear cart" variant="ghost" size="sm" onClick={clear} />
        <div className="flex flex-col items-end gap-2">
          <Text type="supporting" color="secondary">
            {lines.length} item{lines.length === 1 ? '' : 's'} · {vendorCount} vendor
            {vendorCount === 1 ? '' : 's'}
            {hasGap && ' · coverage gap'}
          </Text>
          <Button
            label="Continue to project request →"
            variant="primary"
            onClick={() => router.push('/request/new')}
          />
        </div>
      </div>
    </div>
  );
}
