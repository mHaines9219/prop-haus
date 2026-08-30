'use client';

import { useState, useTransition } from 'react';
import type { InsuranceProfile } from '@/lib/coi/provider';
import { saveInsuranceProfile } from './actions';

type Props = {
  orgId: string;
  orgName: string;
  initialProfile: InsuranceProfile | null;
};

const EMPTY: InsuranceProfile = {
  namedInsured: '',
  glLimit: 1_000_000,
  aggregateLimit: 2_000_000,
  workersCompLimit: undefined,
  additionalInsuredAvailable: true,
  policyRef: '',
  expiresAt: '',
};

export function InsuranceProfileForm({ orgId, orgName, initialProfile }: Props) {
  const [profile, setProfile] = useState<InsuranceProfile>(
    initialProfile ?? { ...EMPTY, namedInsured: orgName }
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function field(key: keyof InsuranceProfile, value: string | number | boolean | undefined) {
    setSaved(false);
    setError(null);
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveInsuranceProfile(orgId, profile);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-0">

      <FormRow label="Named insured">
        <input
          type="text"
          value={profile.namedInsured}
          onChange={(e) => field('namedInsured', e.target.value)}
          placeholder="Production company or org name"
          className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:outline-none"
          required
        />
      </FormRow>

      <FormRow label="Policy reference">
        <input
          type="text"
          value={profile.policyRef ?? ''}
          onChange={(e) => field('policyRef', e.target.value)}
          placeholder="From your insurer — optional"
          className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:outline-none"
        />
      </FormRow>

      <FormRow label="GL limit (per occurrence)">
        <DollarInput
          value={profile.glLimit}
          onChange={(v) => field('glLimit', v)}
        />
      </FormRow>

      <FormRow label="Aggregate limit">
        <DollarInput
          value={profile.aggregateLimit}
          onChange={(v) => field('aggregateLimit', v)}
        />
      </FormRow>

      <FormRow label="Workers comp limit">
        <DollarInput
          value={profile.workersCompLimit ?? 0}
          onChange={(v) => field('workersCompLimit', v || undefined)}
          placeholder="0 if not applicable"
        />
      </FormRow>

      <FormRow label="Policy expiry">
        <input
          type="date"
          value={profile.expiresAt?.slice(0, 10) ?? ''}
          onChange={(e) => field('expiresAt', e.target.value)}
          className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:outline-none"
        />
      </FormRow>

      <FormRow label="Additional insured available" last>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={profile.additionalInsuredAvailable}
            onChange={(e) => field('additionalInsuredAvailable', e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          <span className="font-mono text-[13px] text-text-secondary">
            Yes — endorsement available
          </span>
        </label>
      </FormRow>

      {error && (
        <p className="mt-4 font-mono text-[12px] text-accent-text">{error}</p>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="h-11 min-w-[140px] rounded-sm bg-foreground px-5 font-sans text-[13px] font-medium text-background transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save profile'}
        </button>
        {saved && (
          <span className="font-mono text-[12px] text-text-tertiary">Saved</span>
        )}
      </div>

      <p className="mt-4 font-mono text-[11px] leading-[16px] text-text-disabled">
        Coverage is issued by our licensed insurance partner — not by Prop Haus.
        Prop Haus stores this data to coordinate certificate requests on your behalf.
      </p>
    </form>
  );
}

function FormRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[44px] items-center border-t border-border px-0 ${last ? 'border-b' : ''}`}
    >
      <span className="w-[200px] shrink-0 font-sans text-[13px] text-text-tertiary">{label}</span>
      <div className="flex-1 py-2.5">{children}</div>
    </div>
  );
}

function DollarInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[13px] text-text-tertiary">$</span>
      <input
        type="number"
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder={placeholder ?? '0'}
        min={0}
        step={500000}
        className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:outline-none"
      />
    </div>
  );
}
