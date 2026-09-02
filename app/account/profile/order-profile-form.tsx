'use client';

import { useRef, useState } from 'react';
import { postForm } from '@/lib/api';
import {
  AUTHORIZATION_SENTENCE,
  ENTITY_TYPES,
  type Address,
  type Contact,
  type CoiDocument,
  type EntityType,
  type OrderProfile,
  type OrderReadiness,
} from '@/lib/order-profile';
import { StatusToken } from '@/components/ap/status-token';

const ENTITY_LABELS: Record<EntityType, string> = {
  llc: 'LLC',
  corp: 'Corporation',
  sole_prop: 'Sole proprietor',
  other: 'Other',
};

const INPUT =
  'w-full rounded-[2px] border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-foreground';

type Props = { initialProfile: OrderProfile; initialReadiness: OrderReadiness };

export function OrderProfileForm({ initialProfile, initialReadiness }: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof OrderProfile>(section: K, partial: Partial<OrderProfile[K]>) {
    setSaved(false);
    setError(null);
    setProfile((p) => ({ ...p, [section]: { ...p[section], ...partial } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; profile?: OrderProfile; readiness?: OrderReadiness }
        | null;
      if (!res.ok || !data?.profile || !data.readiness) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setProfile(data.profile);
      setReadiness(data.readiness);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const { company, contacts, defaults, insurance, authorization } = profile;

  return (
    <form onSubmit={handleSubmit}>
      <Section label="Company" first>
        <Row label="Legal name">
          <input
            className={INPUT}
            value={company.legalName ?? ''}
            onChange={(e) => patch('company', { legalName: e.target.value })}
            placeholder="As it appears on your contracts"
          />
        </Row>
        <Row label="DBA">
          <input
            className={INPUT}
            value={company.dba ?? ''}
            onChange={(e) => patch('company', { dba: e.target.value })}
            placeholder="Production or trade name, if different"
          />
        </Row>
        <Row label="Entity type">
          <select
            className={INPUT}
            value={company.entityType ?? ''}
            onChange={(e) =>
              patch('company', { entityType: (e.target.value || undefined) as EntityType | undefined })
            }
          >
            <option value="">—</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_LABELS[t]}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Address">
          <AddressFields value={company.address} onChange={(address) => patch('company', { address })} />
        </Row>
        <Row label="Billing address" hint="Leave blank if the same">
          <AddressFields
            value={company.billingAddress}
            onChange={(billingAddress) => patch('company', { billingAddress })}
          />
        </Row>
        <Row label="Phone">
          <input
            className={INPUT}
            type="tel"
            value={company.phone ?? ''}
            onChange={(e) => patch('company', { phone: e.target.value })}
          />
        </Row>
        <Row label="Website" last>
          <input
            className={INPUT}
            type="url"
            value={company.website ?? ''}
            onChange={(e) => patch('company', { website: e.target.value })}
            placeholder="https://"
          />
        </Row>
      </Section>

      <Section label="Contacts">
        <Row label="Ordering contact" hint="Vendors reply here">
          <ContactFields
            value={contacts.ordering}
            onChange={(ordering) => patch('contacts', { ordering })}
          />
        </Row>
        <Row label="Accounts payable" hint="For vendor account applications" last>
          <ContactFields
            value={contacts.accountsPayable}
            onChange={(accountsPayable) => patch('contacts', { accountsPayable })}
          />
        </Row>
      </Section>

      <Section label="Delivery defaults">
        <Row label="Rental window" hint="Starts the next business day">
          <div className="flex items-center gap-2">
            <input
              className={`${INPUT} w-24`}
              type="number"
              min={1}
              value={defaults.rentalWindowDays ?? ''}
              onChange={(e) =>
                patch('defaults', { rentalWindowDays: e.target.value ? Number(e.target.value) : undefined })
              }
            />
            <span className="font-mono text-[13px] text-text-tertiary">days</span>
          </div>
        </Row>
        <Row label="Delivery address">
          <AddressFields
            value={defaults.deliveryAddress}
            onChange={(deliveryAddress) => patch('defaults', { deliveryAddress })}
          />
        </Row>
        <Row label="Delivery notes" last>
          <textarea
            className={`${INPUT} resize-none`}
            rows={2}
            value={defaults.deliveryNotes ?? ''}
            onChange={(e) => patch('defaults', { deliveryNotes: e.target.value })}
            placeholder="Dock, hours, who to ask for…"
          />
        </Row>
      </Section>

      <Section label="Insurance on file" note="Your broker issues coverage, not Prop Haus. These details fill your vendor requests and COI request forms; the certificate is attached as you uploaded it.">
        <Row label="Certificate">
          <CoiUpload
            document={insurance.coiDocument}
            onUploaded={(coiDocument) => patch('insurance', { coiDocument })}
          />
        </Row>
        <Row label="Carrier">
          <input
            className={INPUT}
            value={insurance.carrier ?? ''}
            onChange={(e) => patch('insurance', { carrier: e.target.value })}
          />
        </Row>
        <Row label="Policy number">
          <input
            className={INPUT}
            value={insurance.policyNumber ?? ''}
            onChange={(e) => patch('insurance', { policyNumber: e.target.value })}
          />
        </Row>
        <Row label="GL limit (per occurrence)">
          <DollarInput
            value={insurance.glLimit}
            onChange={(glLimit) => patch('insurance', { glLimit })}
          />
        </Row>
        <Row label="Aggregate limit">
          <DollarInput
            value={insurance.aggregateLimit}
            onChange={(aggregateLimit) => patch('insurance', { aggregateLimit })}
          />
        </Row>
        <Row label="Workers comp limit">
          <DollarInput
            value={insurance.workersCompLimit}
            onChange={(workersCompLimit) => patch('insurance', { workersCompLimit })}
            placeholder="Blank if not applicable"
          />
        </Row>
        <Row label="Additional insured">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-accent"
              checked={insurance.additionalInsuredAvailable ?? false}
              onChange={(e) => patch('insurance', { additionalInsuredAvailable: e.target.checked })}
            />
            <span className="font-mono text-[13px] text-text-secondary">Endorsement available</span>
          </label>
        </Row>
        <Row label="Policy expiry">
          <input
            className={INPUT}
            type="date"
            value={insurance.expiresAt?.slice(0, 10) ?? ''}
            onChange={(e) => patch('insurance', { expiresAt: e.target.value })}
          />
        </Row>
        <Row label="Broker" hint="COI requests are forwarded here" last>
          <ContactFields value={insurance.broker} onChange={(broker) => patch('insurance', { broker })} />
        </Row>
      </Section>

      <Section label="Authorization">
        <div className="border-y border-border py-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-accent"
              checked={authorization.formsOnBehalf}
              onChange={(e) => patch('authorization', { formsOnBehalf: e.target.checked })}
            />
            <span className="text-[14px] leading-[22px] text-foreground">{AUTHORIZATION_SENTENCE}</span>
          </label>
          {authorization.acceptedAt && (
            <p className="mt-3 pl-[26px] font-mono text-[11px] text-text-tertiary">
              Accepted {formatDate(authorization.acceptedAt)}
            </p>
          )}
        </div>
      </Section>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="h-11 min-w-[140px] rounded-[2px] border border-foreground px-5 font-mono text-[13px] font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {saved && <span className="font-mono text-[12px] text-text-tertiary">Saved</span>}
        {error && <span className="font-mono text-[12px] text-accent-text">{error}</span>}
        <span className="ml-auto">
          <ReadinessBadge readiness={readiness} />
        </span>
      </div>
    </form>
  );
}

function ReadinessBadge({ readiness }: { readiness: OrderReadiness }) {
  if (readiness.ready) return <StatusToken tone="confirmed" label="Ready to order" />;
  return (
    <span className="font-mono text-[12px] text-text-tertiary">
      {readiness.missing.length} thing{readiness.missing.length !== 1 ? 's' : ''} missing before one-click:{' '}
      {readiness.missing.join(', ')}
    </span>
  );
}

function Section({
  label,
  note,
  first,
  children,
}: {
  label: string;
  note?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={first ? '' : 'mt-12'}>
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </h2>
      {note && <p className="mt-2 max-w-[560px] text-[13px] leading-[20px] text-text-secondary">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  last,
  children,
}: {
  label: string;
  hint?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 border-t border-border py-3 sm:flex-row sm:items-start ${last ? 'border-b' : ''}`}>
      <div className="w-[200px] shrink-0 pt-2">
        <span className="text-[13px] text-text-tertiary">{label}</span>
        {hint && <p className="mt-0.5 font-mono text-[11px] text-text-disabled">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function AddressFields({
  value,
  onChange,
}: {
  value: Address | undefined;
  onChange: (a: Address) => void;
}) {
  const a = value ?? {};
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...a, [k]: e.target.value });
  return (
    <div className="space-y-2">
      <input className={INPUT} value={a.line1 ?? ''} onChange={set('line1')} placeholder="Street" />
      <input className={INPUT} value={a.line2 ?? ''} onChange={set('line2')} placeholder="Suite, stage, building" />
      <div className="grid grid-cols-[1fr_72px_100px] gap-2">
        <input className={INPUT} value={a.city ?? ''} onChange={set('city')} placeholder="City" />
        <input className={INPUT} value={a.state ?? ''} onChange={set('state')} placeholder="ST" maxLength={2} />
        <input className={INPUT} value={a.zip ?? ''} onChange={set('zip')} placeholder="ZIP" />
      </div>
    </div>
  );
}

function ContactFields({
  value,
  onChange,
}: {
  value: Contact | undefined;
  onChange: (c: Contact) => void;
}) {
  const c = value ?? {};
  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...c, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input className={INPUT} value={c.name ?? ''} onChange={set('name')} placeholder="Name" />
      <input className={INPUT} type="email" value={c.email ?? ''} onChange={set('email')} placeholder="Email" />
      <input className={INPUT} type="tel" value={c.phone ?? ''} onChange={set('phone')} placeholder="Phone" />
    </div>
  );
}

function DollarInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[13px] text-text-tertiary">$</span>
      <input
        className={INPUT}
        type="number"
        min={0}
        step={500000}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        placeholder={placeholder ?? '0'}
      />
    </div>
  );
}

function CoiUpload({
  document,
  onUploaded,
}: {
  document: CoiDocument | undefined;
  onUploaded: (d: CoiDocument) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { document } = await postForm<{ document: CoiDocument }>('/api/account/insurance/coi', fd);
      onUploaded(document);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
      {document ? (
        <span className="font-mono text-[13px] text-foreground">
          <a href="/api/account/insurance/coi" className="underline underline-offset-4">
            {document.name}
          </a>
          <span className="text-text-tertiary"> · uploaded {formatDate(document.uploadedAt)}</span>
        </span>
      ) : (
        <span className="font-mono text-[13px] text-text-tertiary">No certificate on file</span>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => input.current?.click()}
        className="font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-accent-text underline underline-offset-4 disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : document ? 'Replace' : 'Upload PDF'}
      </button>
      {error && <span className="font-mono text-[12px] text-accent-text">{error}</span>}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
