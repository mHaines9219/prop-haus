'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useProfile } from '@/lib/profile-store';
import type { BusinessProfile, InsurancePolicy } from '@/lib/insurance';
import type { Endorsement } from '@/lib/vendor-coi';
import { ENDORSEMENT_LABEL } from '@/lib/vendor-coi';
import type { ParsedCoi } from '@/lib/insurance-parser';

const ALL_ENDORSEMENTS: Endorsement[] = [
  'waiver-of-subrogation',
  'primary-non-contributory',
  'blanket-additional-insured',
];

export default function InsuranceOnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextHref = params.get('next') ?? '/';
  const { profile, setProfile } = useProfile();
  const [mounted, setMounted] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [carrier, setCarrier] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [brokerEmail, setBrokerEmail] = useState('');
  const [brokerPhone, setBrokerPhone] = useState('');
  const [glOcc, setGlOcc] = useState<number>(1_000_000);
  const [glAgg, setGlAgg] = useState<number>(2_000_000);
  const [autoLiability, setAutoLiability] = useState<number>(1_000_000);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([
    'waiver-of-subrogation',
    'blanket-additional-insured',
  ]);
  const [documentUrl, setDocumentUrl] = useState('');

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedFields, setParsedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
    if (profile) {
      setCompanyName(profile.companyName);
      setAddress(profile.address);
      setContactName(profile.contact.name);
      setContactEmail(profile.contact.email);
      setContactPhone(profile.contact.phone ?? '');
      const p = profile.policy;
      if (p) {
        setCarrier(p.carrier);
        setPolicyNumber(p.policyNumber);
        setEffectiveDate(p.effectiveDate);
        setExpirationDate(p.expirationDate);
        setBrokerName(p.broker.name);
        setBrokerEmail(p.broker.email);
        setBrokerPhone(p.broker.phone ?? '');
        setGlOcc(p.generalLiability.perOccurrence);
        setGlAgg(p.generalLiability.aggregate);
        setAutoLiability(p.autoLiability ?? 0);
        setEndorsements(p.endorsements);
        setDocumentUrl(p.documentUrl ?? '');
      }
    }
  }, [profile]);

  if (!mounted) return <p className="font-sans text-ink/60">Loading…</p>;

  function toggleEndorsement(e: Endorsement) {
    setEndorsements((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }

  async function handleUpload(file: File) {
    setParsing(true);
    setParseError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/insurance/parse', { method: 'POST', body: fd });
      const data = (await res.json()) as { parsed?: ParsedCoi; error?: string };
      if (!res.ok || !data.parsed) {
        throw new Error(data.error ?? 'Parse failed');
      }
      const p = data.parsed;
      const hits = new Set<string>();
      if (p.companyName) {
        setCompanyName(p.companyName);
        hits.add('companyName');
      }
      if (p.address) {
        setAddress(p.address);
        hits.add('address');
      }
      if (p.carrier) {
        setCarrier(p.carrier);
        hits.add('carrier');
      }
      if (p.policyNumber) {
        setPolicyNumber(p.policyNumber);
        hits.add('policyNumber');
      }
      if (p.effectiveDate) {
        setEffectiveDate(p.effectiveDate);
        hits.add('effectiveDate');
      }
      if (p.expirationDate) {
        setExpirationDate(p.expirationDate);
        hits.add('expirationDate');
      }
      if (p.brokerName) {
        setBrokerName(p.brokerName);
        hits.add('brokerName');
      }
      if (p.brokerEmail) {
        setBrokerEmail(p.brokerEmail);
        hits.add('brokerEmail');
      }
      if (p.brokerPhone) {
        setBrokerPhone(p.brokerPhone);
        hits.add('brokerPhone');
      }
      if (p.glPerOccurrence !== null) {
        setGlOcc(p.glPerOccurrence);
        hits.add('glOcc');
      }
      if (p.glAggregate !== null) {
        setGlAgg(p.glAggregate);
        hits.add('glAgg');
      }
      if (p.autoLiability !== null) {
        setAutoLiability(p.autoLiability);
        hits.add('autoLiability');
      }
      if (p.endorsements.length > 0) {
        setEndorsements(p.endorsements);
        hits.add('endorsements');
      }
      setParsedFields(hits);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const policy: InsurancePolicy = {
      carrier,
      policyNumber,
      effectiveDate,
      expirationDate,
      broker: { name: brokerName, email: brokerEmail, phone: brokerPhone || undefined },
      generalLiability: { perOccurrence: glOcc, aggregate: glAgg },
      autoLiability: autoLiability || undefined,
      endorsements,
      documentUrl: documentUrl || undefined,
    };
    const next: BusinessProfile = {
      companyName,
      address,
      contact: { name: contactName, email: contactEmail, phone: contactPhone || undefined },
      policy,
    };
    setProfile(next);
    router.push(nextHref);
  }

  return (
    <form onSubmit={submit} className="space-y-10 max-w-3xl">
      <div className="space-y-2">
        <p className="font-sans text-xs uppercase tracking-widest text-ink/50">Onboarding</p>
        <h1 className="font-display text-4xl">Your business insurance</h1>
        <p className="font-sans text-sm text-ink/70">
          Enter your master policy once. We&rsquo;ll automatically check it against every prop house&rsquo;s
          requirements and let you know if there&rsquo;s a coverage gap before you submit a project.
        </p>
      </div>

      <section className="border-2 border-dashed border-ink/25 p-6 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">Upload your COI (skip the typing)</h2>
          {parsedFields.size > 0 && (
            <span className="font-sans text-xs uppercase tracking-widest text-emerald-800">
              {parsedFields.size} field{parsedFields.size === 1 ? '' : 's'} auto-filled
            </span>
          )}
        </div>
        <p className="font-sans text-sm text-ink/70">
          Drop an ACORD 25 PDF and we&rsquo;ll extract your carrier, policy, limits, broker, and
          endorsements. <strong>Always review the fields below before saving.</strong>
        </p>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="application/pdf"
            disabled={parsing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
            className="font-sans text-sm"
          />
          {parsing && <span className="font-sans text-xs text-ink/60">Parsing…</span>}
        </div>
        {parseError && (
          <p className="font-sans text-xs text-rose-800 bg-rose-50 border border-rose-200 p-2">
            {parseError}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl">Business</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Company name"
            required
            value={companyName}
            onChange={setCompanyName}
            highlight={parsedFields.has('companyName')}
          />
          <Field
            label="Address"
            required
            value={address}
            onChange={setAddress}
            highlight={parsedFields.has('address')}
          />
          <Field label="Primary contact name" required value={contactName} onChange={setContactName} />
          <Field label="Contact email" required type="email" value={contactEmail} onChange={setContactEmail} />
          <Field label="Contact phone" value={contactPhone} onChange={setContactPhone} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl">Policy</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Carrier"
            required
            value={carrier}
            onChange={setCarrier}
            placeholder="e.g. The Hartford"
            highlight={parsedFields.has('carrier')}
          />
          <Field
            label="Policy number"
            required
            value={policyNumber}
            onChange={setPolicyNumber}
            highlight={parsedFields.has('policyNumber')}
          />
          <DateField
            label="Effective date"
            required
            value={effectiveDate}
            onChange={setEffectiveDate}
            highlight={parsedFields.has('effectiveDate')}
          />
          <DateField
            label="Expiration date"
            required
            value={expirationDate}
            onChange={setExpirationDate}
            highlight={parsedFields.has('expirationDate')}
          />
        </div>

        <h3 className="font-sans uppercase text-[10px] tracking-widest text-ink/50 pt-2">Limits</h3>
        <div className="grid grid-cols-3 gap-4">
          <NumField
            label="GL per occurrence"
            value={glOcc}
            onChange={setGlOcc}
            highlight={parsedFields.has('glOcc')}
          />
          <NumField
            label="GL aggregate"
            value={glAgg}
            onChange={setGlAgg}
            highlight={parsedFields.has('glAgg')}
          />
          <NumField
            label="Auto liability"
            value={autoLiability}
            onChange={setAutoLiability}
            highlight={parsedFields.has('autoLiability')}
          />
        </div>

        <h3 className="font-sans uppercase text-[10px] tracking-widest text-ink/50 pt-2">
          Endorsements
          {parsedFields.has('endorsements') && (
            <span className="text-emerald-700 normal-case ml-2">· auto-filled</span>
          )}
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_ENDORSEMENTS.map((e) => {
            const on = endorsements.includes(e);
            return (
              <button
                type="button"
                key={e}
                onClick={() => toggleEndorsement(e)}
                className={`font-sans text-xs uppercase tracking-widest px-3 py-2 border transition ${
                  on ? 'bg-ink text-paper border-ink' : 'border-ink/30 hover:bg-ink hover:text-paper'
                }`}
              >
                {ENDORSEMENT_LABEL[e]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl">Broker</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Broker name"
            required
            value={brokerName}
            onChange={setBrokerName}
            highlight={parsedFields.has('brokerName')}
          />
          <Field
            label="Broker email"
            required
            type="email"
            value={brokerEmail}
            onChange={setBrokerEmail}
            highlight={parsedFields.has('brokerEmail')}
          />
          <Field
            label="Broker phone"
            value={brokerPhone}
            onChange={setBrokerPhone}
            highlight={parsedFields.has('brokerPhone')}
          />
          <Field
            label="Master policy document URL (optional)"
            value={documentUrl}
            onChange={setDocumentUrl}
            placeholder="https://..."
          />
        </div>
      </section>

      <div className="flex items-center justify-between border-t border-ink/15 pt-6">
        <Link href={nextHref} className="font-sans text-sm text-ink/60 underline">
          Skip for now
        </Link>
        <button
          type="submit"
          className="font-sans uppercase tracking-widest text-sm px-5 py-3 bg-ink text-paper hover:bg-accent transition"
        >
          Save insurance
        </button>
      </div>
    </form>
  );
}

function fieldClass(highlight?: boolean) {
  return `border px-3 py-2 w-full bg-paper ${highlight ? 'border-emerald-500 bg-emerald-50' : 'border-ink/30'}`;
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  highlight?: boolean;
}) {
  return (
    <label className="font-sans text-sm space-y-1">
      <span className="block uppercase text-[10px] tracking-widest text-ink/50">
        {label}
        {required && ' *'}
        {highlight && <span className="text-emerald-700 normal-case"> · auto-filled</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass(highlight)}
      />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  highlight,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  highlight?: boolean;
}) {
  return (
    <label className="font-sans text-sm space-y-1">
      <span className="block uppercase text-[10px] tracking-widest text-ink/50">
        {label}
        {highlight && <span className="text-emerald-700 normal-case"> · auto-filled</span>}
      </span>
      <input
        type="number"
        min={0}
        step={50000}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={fieldClass(highlight)}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  required,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  highlight?: boolean;
}) {
  return (
    <label className="font-sans text-sm space-y-1">
      <span className="block uppercase text-[10px] tracking-widest text-ink/50">
        {label}
        {required && ' *'}
        {highlight && <span className="text-emerald-700 normal-case"> · auto-filled</span>}
      </span>
      <input
        type="date"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass(highlight)}
      />
    </label>
  );
}
