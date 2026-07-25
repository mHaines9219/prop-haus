'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { postForm } from '@/lib/api';
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

const AUTOFILLED = { type: 'success', message: 'auto-filled' } as const;

function InsuranceOnboardingForm() {
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

  const [parsedFields, setParsedFields] = useState<Set<string>>(new Set());

  // Upload a COI and let the parser pre-fill whatever fields it recognizes.
  const parseUpload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return postForm<{ parsed: ParsedCoi }>('/api/insurance/parse', fd);
    },
    onSuccess: ({ parsed }) => setParsedFields(applyParsed(parsed)),
  });

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

  if (!mounted) return <Text color="secondary">Loading…</Text>;

  function toggleEndorsement(e: Endorsement) {
    setEndorsements((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }

  // Apply each field the parser returned, recording which ones were filled so
  // the UI can flag them. Presence rules differ by type (strings: truthy;
  // numbers: non-null so 0 still applies; endorsements: non-empty).
  function applyParsed(p: ParsedCoi): Set<string> {
    const hits = new Set<string>();
    const apply = <T,>(key: string, present: boolean, value: T, set: (v: T) => void) => {
      if (present) {
        set(value);
        hits.add(key);
      }
    };
    apply('companyName', !!p.companyName, p.companyName!, setCompanyName);
    apply('address', !!p.address, p.address!, setAddress);
    apply('carrier', !!p.carrier, p.carrier!, setCarrier);
    apply('policyNumber', !!p.policyNumber, p.policyNumber!, setPolicyNumber);
    apply('effectiveDate', !!p.effectiveDate, p.effectiveDate!, setEffectiveDate);
    apply('expirationDate', !!p.expirationDate, p.expirationDate!, setExpirationDate);
    apply('brokerName', !!p.brokerName, p.brokerName!, setBrokerName);
    apply('brokerEmail', !!p.brokerEmail, p.brokerEmail!, setBrokerEmail);
    apply('brokerPhone', !!p.brokerPhone, p.brokerPhone!, setBrokerPhone);
    apply('glOcc', p.glPerOccurrence !== null, p.glPerOccurrence!, setGlOcc);
    apply('glAgg', p.glAggregate !== null, p.glAggregate!, setGlAgg);
    apply('autoLiability', p.autoLiability !== null, p.autoLiability!, setAutoLiability);
    apply('endorsements', p.endorsements.length > 0, p.endorsements, setEndorsements);
    return hits;
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

  const flag = (key: string) => (parsedFields.has(key) ? AUTOFILLED : undefined);

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-10">
      <div className="space-y-2">
        <Text type="label" color="secondary">
          Onboarding
        </Text>
        <Heading level={1}>Your business insurance</Heading>
        <Text color="secondary">
          Enter your master policy once. We&rsquo;ll automatically check it against every prop
          house&rsquo;s requirements and let you know if there&rsquo;s a coverage gap before you submit
          a project.
        </Text>
      </div>

      <section className="space-y-3 border-2 border-dashed border-ink/25 p-6">
        <div className="flex items-baseline justify-between gap-3">
          <Heading level={2}>Upload your COI (skip the typing)</Heading>
          {parsedFields.size > 0 && (
            <Text type="label" color="accent">
              {parsedFields.size} field{parsedFields.size === 1 ? '' : 's'} auto-filled
            </Text>
          )}
        </div>
        <Text color="secondary">
          Drop an ACORD 25 PDF and we&rsquo;ll extract your carrier, policy, limits, broker, and
          endorsements. Always review the fields below before saving.
        </Text>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="application/pdf"
            disabled={parseUpload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) parseUpload.mutate(f);
            }}
            className="text-sm"
          />
          {parseUpload.isPending && <Text type="supporting" color="secondary">Parsing…</Text>}
        </div>
        {parseUpload.isError && (
          <Banner status="error" title="Couldn’t read that PDF" description={parseUpload.error.message} />
        )}
      </section>

      <section className="space-y-4">
        <Heading level={2}>Business</Heading>
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Company name" isRequired value={companyName} onChange={setCompanyName} status={flag('companyName')} />
          <TextInput label="Address" isRequired value={address} onChange={setAddress} status={flag('address')} />
          <TextInput label="Primary contact name" isRequired value={contactName} onChange={setContactName} />
          <TextInput label="Contact email" type="email" isRequired value={contactEmail} onChange={setContactEmail} />
          <TextInput label="Contact phone" value={contactPhone} onChange={setContactPhone} />
        </div>
      </section>

      <section className="space-y-4">
        <Heading level={2}>Policy</Heading>
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Carrier" isRequired value={carrier} onChange={setCarrier} placeholder="e.g. The Hartford" status={flag('carrier')} />
          <TextInput label="Policy number" isRequired value={policyNumber} onChange={setPolicyNumber} status={flag('policyNumber')} />
          <DateInput label="Effective date" isRequired value={(effectiveDate || undefined) as ISODateString | undefined} onChange={(v) => setEffectiveDate(v ?? '')} status={flag('effectiveDate')} />
          <DateInput label="Expiration date" isRequired value={(expirationDate || undefined) as ISODateString | undefined} onChange={(v) => setExpirationDate(v ?? '')} status={flag('expirationDate')} />
        </div>

        <Text type="label" color="secondary">
          Limits
        </Text>
        <div className="grid grid-cols-3 gap-4">
          <NumberInput label="GL per occurrence" min={0} step={50000} value={glOcc} onChange={setGlOcc} status={flag('glOcc')} />
          <NumberInput label="GL aggregate" min={0} step={50000} value={glAgg} onChange={setGlAgg} status={flag('glAgg')} />
          <NumberInput label="Auto liability" min={0} step={50000} value={autoLiability} onChange={setAutoLiability} status={flag('autoLiability')} />
        </div>

        <Text type="label" color="secondary">
          Endorsements{parsedFields.has('endorsements') && ' · auto-filled'}
        </Text>
        <div className="flex flex-wrap gap-2">
          {ALL_ENDORSEMENTS.map((e) => (
            <Button
              key={e}
              label={ENDORSEMENT_LABEL[e]}
              size="sm"
              variant={endorsements.includes(e) ? 'primary' : 'secondary'}
              onClick={() => toggleEndorsement(e)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Heading level={2}>Broker</Heading>
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Broker name" isRequired value={brokerName} onChange={setBrokerName} status={flag('brokerName')} />
          <TextInput label="Broker email" type="email" isRequired value={brokerEmail} onChange={setBrokerEmail} status={flag('brokerEmail')} />
          <TextInput label="Broker phone" value={brokerPhone} onChange={setBrokerPhone} status={flag('brokerPhone')} />
          <TextInput label="Master policy document URL" isOptional value={documentUrl} onChange={setDocumentUrl} placeholder="https://..." />
        </div>
      </section>

      <div className="flex items-center justify-between border-t border-ink/15 pt-6">
        <Link href={nextHref}>Skip for now</Link>
        <Button label="Save insurance" variant="primary" type="submit" />
      </div>
    </form>
  );
}

export default function InsuranceOnboardingPage() {
  return (
    <Suspense fallback={null}>
      <InsuranceOnboardingForm />
    </Suspense>
  );
}
