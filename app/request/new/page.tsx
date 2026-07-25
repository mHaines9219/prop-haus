'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { DateInput } from '@astryxdesign/core/DateInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { postJson } from '@/lib/api';
import { useCart } from '@/lib/cart-store';
import { useProfile } from '@/lib/profile-store';
import { SOURCE_META, type Source } from '@/lib/types';
import { checkCompatibility } from '@/lib/insurance';
import { CoiBadge } from '@/components/coi-badge';
import type { CreateProjectInput } from '@/lib/projects';

const PRODUCTION_TYPES = [
  { value: 'commercial', label: 'Commercial' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'film', label: 'Film / TV' },
  { value: 'event', label: 'Event / Experiential' },
  { value: 'other', label: 'Other' },
];

export default function NewRequestPage() {
  const router = useRouter();
  const { lines, startDate, endDate, setDates, clear } = useCart();
  const { profile } = useProfile();
  const [mounted, setMounted] = useState(false);

  const submitProject = useMutation({
    mutationFn: (body: CreateProjectInput) => postJson<{ id: string }>('/api/projects', body),
    onSuccess: (data) => {
      clear();
      router.push(`/projects/${data.id}`);
    },
    onError: (e) => alert(e.message),
  });

  const [productionName, setProductionName] = useState('');
  const [productionType, setProductionType] = useState('commercial');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setMounted(true);
    if (profile) {
      if (!contactName) setContactName(profile.contact.name);
      if (!contactEmail) setContactEmail(profile.contact.email);
      if (!contactPhone && profile.contact.phone) setContactPhone(profile.contact.phone);
    }
  }, [profile]);
  if (!mounted) return <Text color="secondary">Loading…</Text>;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="No items in your cart"
        description="Browse the catalog and add pieces before submitting a project request."
        actions={<Button label="Browse catalog" variant="primary" onClick={() => router.push('/')} />}
      />
    );
  }

  const byVendor = lines.reduce<Record<string, typeof lines>>((acc, l) => {
    (acc[l.item.source] ??= []).push(l);
    return acc;
  }, {});
  const vendorCount = Object.keys(byVendor).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) {
      alert('Please set start and end dates');
      return;
    }
    submitProject.mutate({
      productionName,
      productionType,
      startDate,
      endDate,
      deliveryAddress,
      contactName,
      contactEmail,
      contactPhone,
      budget: budget || undefined,
      notes: notes || undefined,
      insured: profile ?? undefined,
      lines: lines.map((l) => ({
        itemId: l.item.id,
        sourceId: l.item.sourceId,
        source: l.item.source,
        name: l.item.name,
        image: l.item.images[0],
        qty: l.qty,
      })),
    });
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-10">
      <div className="space-y-2">
        <Link href="/cart">← back to cart</Link>
        <Heading level={1}>New project request</Heading>
        <Text color="secondary">
          Submit one request and we&rsquo;ll coordinate availability across each vendor below.
        </Text>
      </div>

      <section className="space-y-4">
        <Heading level={2}>Production</Heading>
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="Production name"
            isRequired
            value={productionName}
            onChange={setProductionName}
          />
          <Selector
            label="Type"
            value={productionType}
            options={PRODUCTION_TYPES}
            onChange={(v) => setProductionType(v ?? 'commercial')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <DateInput
            label="Start date"
            isRequired
            value={(startDate ?? undefined) as ISODateString | undefined}
            onChange={(v) => setDates(v ?? null, endDate)}
          />
          <DateInput
            label="End date"
            isRequired
            value={(endDate ?? undefined) as ISODateString | undefined}
            onChange={(v) => setDates(startDate, v ?? null)}
          />
        </div>
        <TextInput
          label="Delivery / pickup address"
          isRequired
          value={deliveryAddress}
          onChange={setDeliveryAddress}
        />
      </section>

      <section className="space-y-4">
        <Heading level={2}>Contact</Heading>
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Name" isRequired value={contactName} onChange={setContactName} />
          <TextInput
            label="Email"
            type="email"
            isRequired
            value={contactEmail}
            onChange={setContactEmail}
          />
          <TextInput label="Phone" value={contactPhone} onChange={setContactPhone} />
          <TextInput
            label="Budget"
            isOptional
            value={budget}
            onChange={setBudget}
            placeholder="e.g. $5–10k"
          />
        </div>
        <TextArea
          label="Notes / moodboard links"
          isOptional
          rows={4}
          value={notes}
          onChange={(v) => setNotes(v)}
        />
      </section>

      <section className="space-y-4">
        <Heading level={2}>Items by vendor</Heading>
        <Text type="supporting" color="secondary">
          We&rsquo;ll send one request per vendor. {vendorCount} vendor
          {vendorCount === 1 ? '' : 's'}, {lines.length} item{lines.length === 1 ? '' : 's'}.
        </Text>
        <div className="space-y-4">
          {Object.entries(byVendor).map(([src, vlines]) => (
            <Card key={src}>
              <div className="space-y-2">
                <Text type="label" color="secondary">
                  {SOURCE_META[src as keyof typeof SOURCE_META]?.name ?? src}
                </Text>
                <List>
                  {vlines.map((l) => (
                    <ListItem
                      key={l.item.id}
                      label={l.item.name}
                      endContent={
                        <Text color="secondary">×{l.qty}</Text>
                      }
                    />
                  ))}
                </List>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Heading level={2}>Insurance</Heading>
        {!profile?.policy ? (
          <Banner
            status="warning"
            title="No business insurance on file"
            description="You can submit without it, but vendors will require a COI before pickup."
            endContent={
              <Button
                label="Add insurance now"
                variant="secondary"
                size="sm"
                onClick={() => router.push('/onboarding/insurance?next=/request/new')}
              />
            }
          />
        ) : (
          <Card>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <Text>
                  {profile.policy.carrier} · policy #
                  {profile.policy.policyNumber.slice(-4).padStart(8, '•')} · expires{' '}
                  {profile.policy.expirationDate}
                </Text>
                <Link href="/onboarding/insurance?next=/request/new">Edit</Link>
              </div>
              <List hasDividers>
                {(Array.from(new Set(lines.map((l) => l.item.source))) as Source[]).map((src) => {
                  const result = checkCompatibility(
                    profile.policy,
                    src,
                    startDate && endDate ? { start: startDate, end: endDate } : null,
                  );
                  const detail = result.issues
                    .map((i) => `${i.field}: need ${i.required}, have ${i.actual}`)
                    .join(' · ');
                  return (
                    <ListItem
                      key={src}
                      label={SOURCE_META[src]?.name ?? src}
                      description={detail || undefined}
                      endContent={<CoiBadge result={result} />}
                    />
                  );
                })}
              </List>
            </div>
          </Card>
        )}
      </section>

      <div className="flex items-center justify-between">
        <Link href="/cart">Back to cart</Link>
        <Button
          label={submitProject.isPending ? 'Submitting…' : 'Submit request'}
          variant="primary"
          type="submit"
          isLoading={submitProject.isPending}
          isDisabled={submitProject.isPending}
        />
      </div>
    </form>
  );
}
