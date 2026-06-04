'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-store';
import { useProfile } from '@/lib/profile-store';
import { SOURCE_META, type Source } from '@/lib/types';
import { checkCompatibility } from '@/lib/insurance';
import { CoiBadge } from '@/components/coi-badge';
import type { CreateProjectInput } from '@/lib/projects';

export default function NewRequestPage() {
  const router = useRouter();
  const { lines, startDate, endDate, setDates, clear } = useCart();
  const { profile } = useProfile();
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
  if (!mounted) return <p className="font-sans text-ink/60">Loading…</p>;

  if (lines.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <h1 className="font-display text-4xl">No items in your cart</h1>
        <Link
          href="/"
          className="inline-block font-sans uppercase tracking-widest text-sm border border-ink/40 px-4 py-2"
        >
          Browse catalog
        </Link>
      </div>
    );
  }

  const byVendor = lines.reduce<Record<string, typeof lines>>((acc, l) => {
    (acc[l.item.source] ??= []).push(l);
    return acc;
  }, {});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) {
      alert('Please set start and end dates');
      return;
    }
    setSubmitting(true);
    const body: CreateProjectInput = {
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
    };
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!data.id) {
      setSubmitting(false);
      alert(data.error ?? 'Submission failed');
      return;
    }
    clear();
    router.push(`/projects/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-10 max-w-3xl">
      <div className="space-y-2">
        <Link href="/cart" className="font-sans text-xs uppercase tracking-widest text-ink/50">
          ← back to cart
        </Link>
        <h1 className="font-display text-4xl">New project request</h1>
        <p className="font-sans text-sm text-ink/70">
          Submit one request and we&rsquo;ll coordinate availability across each vendor below.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl">Production</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Production name" required value={productionName} onChange={setProductionName} />
          <label className="font-sans text-sm space-y-1">
            <span className="block uppercase text-[10px] tracking-widest text-ink/50">Type</span>
            <select
              value={productionType}
              onChange={(e) => setProductionType(e.target.value)}
              className="border border-ink/30 px-3 py-2 w-full bg-paper"
            >
              <option value="commercial">Commercial</option>
              <option value="editorial">Editorial</option>
              <option value="film">Film / TV</option>
              <option value="event">Event / Experiential</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <DateField
            label="Start date"
            required
            value={startDate ?? ''}
            onChange={(v) => setDates(v || null, endDate)}
          />
          <DateField
            label="End date"
            required
            value={endDate ?? ''}
            onChange={(v) => setDates(startDate, v || null)}
          />
        </div>
        <Field
          label="Delivery / pickup address"
          required
          value={deliveryAddress}
          onChange={setDeliveryAddress}
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl">Contact</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required value={contactName} onChange={setContactName} />
          <Field label="Email" required type="email" value={contactEmail} onChange={setContactEmail} />
          <Field label="Phone" value={contactPhone} onChange={setContactPhone} />
          <Field label="Budget (optional)" value={budget} onChange={setBudget} placeholder="e.g. $5–10k" />
        </div>
        <label className="font-sans text-sm space-y-1 block">
          <span className="block uppercase text-[10px] tracking-widest text-ink/50">Notes / moodboard links</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="border border-ink/30 px-3 py-2 w-full bg-paper"
          />
        </label>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl">Items by vendor</h2>
        <p className="font-sans text-xs text-ink/60">
          We&rsquo;ll send one request per vendor. {Object.keys(byVendor).length} vendor
          {Object.keys(byVendor).length === 1 ? '' : 's'}, {lines.length} item
          {lines.length === 1 ? '' : 's'}.
        </p>
        <div className="space-y-4">
          {Object.entries(byVendor).map(([src, vlines]) => (
            <div key={src} className="border border-ink/15 p-4">
              <p className="font-sans text-xs uppercase tracking-widest text-ink/60 mb-2">
                {SOURCE_META[src as keyof typeof SOURCE_META]?.name ?? src}
              </p>
              <ul className="text-sm font-sans space-y-1">
                {vlines.map((l) => (
                  <li key={l.item.id} className="flex justify-between gap-4">
                    <span>{l.item.name}</span>
                    <span className="text-ink/60">×{l.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl">Insurance</h2>
        {!profile?.policy ? (
          <div className="border border-amber-400/60 bg-amber-50 p-4 space-y-2">
            <p className="font-sans text-sm">
              No business insurance on file. You can submit without it, but vendors will require a COI
              before pickup.
            </p>
            <Link
              href={`/onboarding/insurance?next=/request/new`}
              className="inline-block font-sans uppercase tracking-widest text-xs border border-ink/40 px-3 py-2 hover:bg-ink hover:text-paper transition"
            >
              Add insurance now
            </Link>
          </div>
        ) : (
          <div className="border border-ink/15 p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="font-sans text-sm">
                {profile.policy.carrier} · policy #{profile.policy.policyNumber.slice(-4).padStart(8, '•')}
                <span className="text-ink/50">
                  {' '}
                  · expires {profile.policy.expirationDate}
                </span>
              </p>
              <Link
                href={`/onboarding/insurance?next=/request/new`}
                className="font-sans text-xs underline text-ink/60"
              >
                Edit
              </Link>
            </div>
            <ul className="divide-y divide-ink/10">
              {(Array.from(new Set(lines.map((l) => l.item.source))) as Source[]).map((src) => {
                const result = checkCompatibility(
                  profile.policy,
                  src,
                  startDate && endDate ? { start: startDate, end: endDate } : null,
                );
                return (
                  <li key={src} className="py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-sm">{SOURCE_META[src]?.name ?? src}</span>
                      <CoiBadge result={result} />
                    </div>
                    {result.issues.length > 0 && (
                      <ul className="font-sans text-xs text-ink/70 list-disc pl-5">
                        {result.issues.map((i, idx) => (
                          <li key={idx}>
                            <strong>{i.field}:</strong> need {i.required}, have {i.actual}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between">
        <Link href="/cart" className="font-sans text-sm text-ink/60 underline">
          Back to cart
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="font-sans uppercase tracking-widest text-sm px-5 py-3 bg-ink text-paper hover:bg-accent transition disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="font-sans text-sm space-y-1">
      <span className="block uppercase text-[10px] tracking-widest text-ink/50">
        {label}
        {required && ' *'}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-ink/30 px-3 py-2 w-full bg-paper"
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="font-sans text-sm space-y-1">
      <span className="block uppercase text-[10px] tracking-widest text-ink/50">
        {label}
        {required && ' *'}
      </span>
      <input
        type="date"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-ink/30 px-3 py-2 w-full bg-paper"
      />
    </label>
  );
}
