'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { postJson } from '@/lib/api';
import { suggestPeriods, type LineItem, type LineStatus, type Quote } from '@/lib/projects';
import { FLAT_FEE_UNITS, PRICE_UNITS, type PriceUnit } from '@/lib/types';

type UpdateVars = { itemId: string; status: LineStatus; quote?: Quote; subNote?: string };

const UNIT_OPTIONS = PRICE_UNITS.map((u) => ({
  value: u,
  label: u === 'purchase' ? 'purchase (sale)' : u === 'event' ? 'event (flat)' : `per ${u}`,
}));

export function VendorResponseForm({
  token,
  items,
  startDate,
  endDate,
}: {
  token: string;
  items: LineItem[];
  startDate: string;
  endDate: string;
}) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: (vars: UpdateVars) => postJson(`/api/vendor/${token}`, vars),
    onSuccess: () => router.refresh(),
  });

  const update = (
    item: LineItem,
    status: LineStatus,
    extra: { quote?: Quote; subNote?: string } = {},
  ) => mutation.mutate({ itemId: item.itemId, status, ...extra });

  return (
    <section className="space-y-4">
      <Heading level={2}>Items requested</Heading>
      <ul className="divide-y divide-ink/15 border-y border-ink/15">
        {items.map((item) => (
          <ItemRow
            key={item.itemId}
            item={item}
            startDate={startDate}
            endDate={endDate}
            pending={mutation.isPending && mutation.variables?.itemId === item.itemId}
            onUpdate={update}
          />
        ))}
      </ul>
      <Text type="supporting" color="secondary">
        Click a status to record your response. Quote your own rate and billable periods — we
        prefill the period count from the booking dates, but your number is the one we use. Updates
        are saved immediately.
      </Text>
    </section>
  );
}

function ItemRow({
  item,
  startDate,
  endDate,
  pending,
  onUpdate,
}: {
  item: LineItem;
  startDate: string;
  endDate: string;
  pending: boolean;
  onUpdate: (
    item: LineItem,
    status: LineStatus,
    extra?: { quote?: Quote; subNote?: string },
  ) => void;
}) {
  const [amount, setAmount] = useState<string>(item.quote?.amount.toString() ?? '');
  const [unit, setUnit] = useState<PriceUnit>(item.quote?.unit ?? 'day');
  // Prefilled from the booking window as a starting point; the vendor owns the final count.
  const [periods, setPeriods] = useState<string>(
    (
      item.quote?.periods ?? suggestPeriods(item.quote?.unit ?? 'day', startDate, endDate)
    ).toString(),
  );
  const [subNote, setSubNote] = useState<string>(item.subNote ?? '');

  const isFlatFee = FLAT_FEE_UNITS.includes(unit);
  const amountNum = amount ? Number(amount) : undefined;
  const periodsNum = isFlatFee ? 1 : periods ? Number(periods) : 1;

  // Re-suggest the count when the vendor switches unit — a "3" that meant days
  // should not silently come to mean weeks.
  const onUnitChange = (next: string) => {
    const u = next as PriceUnit;
    setUnit(u);
    setPeriods(suggestPeriods(u, startDate, endDate).toString());
  };

  const quote: Quote | undefined =
    amountNum && amountNum > 0
      ? { amount: amountNum, unit, periods: periodsNum, currency: 'USD' }
      : undefined;

  const runningTotal = quote ? quote.amount * item.qty * quote.periods : undefined;

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
            onClick={() => onUpdate(item, 'available', { quote })}
          />
          <Button
            label="Substitution"
            size="sm"
            variant={item.status === 'sub' ? 'primary' : 'secondary'}
            isDisabled={pending}
            onClick={() => onUpdate(item, 'sub', { subNote: subNote || undefined, quote })}
          />
          <Button
            label="Unavailable"
            size="sm"
            variant={item.status === 'unavailable' ? 'primary' : 'secondary'}
            isDisabled={pending}
            onClick={() => onUpdate(item, 'unavailable')}
          />
          <div className="w-28">
            <NumberInput
              label="Rate"
              isLabelHidden
              size="sm"
              placeholder="Rate"
              value={amountNum}
              onChange={(v) => setAmount(v ? String(v) : '')}
            />
          </div>
          <div className="w-36">
            <Selector
              label="Rate unit"
              isLabelHidden
              size="sm"
              options={UNIT_OPTIONS}
              value={unit}
              onChange={onUnitChange}
            />
          </div>
          {!isFlatFee && (
            <div className="w-28">
              <NumberInput
                label={`Billable ${unit}s`}
                isLabelHidden
                size="sm"
                placeholder={`# of ${unit}s`}
                value={periods ? Number(periods) : undefined}
                onChange={(v) => setPeriods(v ? String(v) : '')}
              />
            </div>
          )}
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

        {quote && runningTotal !== undefined && (
          <Text type="supporting" color="secondary">
            {isFlatFee
              ? `$${quote.amount.toFixed(2)} flat × qty ${item.qty}`
              : `$${quote.amount.toFixed(2)}/${unit} × ${quote.periods} ${unit}${
                  quote.periods === 1 ? '' : 's'
                } × qty ${item.qty}`}{' '}
            = ${runningTotal.toFixed(2)}
          </Text>
        )}

        {item.quote && (
          <Text type="supporting" color="secondary">
            Recorded: ${item.quote.amount.toFixed(2)}/{item.quote.unit}
            {!FLAT_FEE_UNITS.includes(item.quote.unit) && ` × ${item.quote.periods}`}
            {item.subNote && ` · ${item.subNote}`}
          </Text>
        )}
      </div>
    </li>
  );
}
