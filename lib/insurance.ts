import type { Source } from './types';
import { VENDOR_COI, ENDORSEMENT_LABEL, type Endorsement, type CoiRequirements } from './vendor-coi';

export type InsurancePolicy = {
  carrier: string;
  policyNumber: string;
  effectiveDate: string;
  expirationDate: string;
  broker: { name: string; email: string; phone?: string };
  generalLiability: { perOccurrence: number; aggregate: number };
  autoLiability?: number;
  endorsements: Endorsement[];
  documentUrl?: string;
};

export type BusinessProfile = {
  companyName: string;
  address: string;
  contact: { name: string; email: string; phone?: string };
  policy?: InsurancePolicy;
};

export type CompatibilityIssue = {
  field: string;
  required: string;
  actual: string;
  severity: 'block' | 'warn';
  message: string;
};

export type CompatibilityResult = {
  status: 'ok' | 'warning' | 'gap' | 'no-policy' | 'not-required';
  issues: CompatibilityIssue[];
};

export function checkCompatibility(
  policy: InsurancePolicy | null | undefined,
  source: Source,
  shootDates?: { start: string; end: string } | null,
  opts: { studioPickup?: boolean } = {},
): CompatibilityResult {
  const req = VENDOR_COI[source];
  if (!req?.required) return { status: 'not-required', issues: [] };
  if (!policy) return { status: 'no-policy', issues: [] };

  const issues: CompatibilityIssue[] = [];

  if (policy.generalLiability.perOccurrence < req.generalLiability.perOccurrence) {
    issues.push({
      field: 'GL per occurrence',
      required: fmt(req.generalLiability.perOccurrence),
      actual: fmt(policy.generalLiability.perOccurrence),
      severity: 'block',
      message: `General liability per-occurrence below vendor minimum.`,
    });
  }
  if (policy.generalLiability.aggregate < req.generalLiability.aggregate) {
    issues.push({
      field: 'GL aggregate',
      required: fmt(req.generalLiability.aggregate),
      actual: fmt(policy.generalLiability.aggregate),
      severity: 'block',
      message: `General liability aggregate below vendor minimum.`,
    });
  }

  if (req.autoLiability && !opts.studioPickup) {
    const auto = policy.autoLiability ?? 0;
    if (auto < req.autoLiability) {
      issues.push({
        field: 'Auto liability',
        required: fmt(req.autoLiability),
        actual: auto ? fmt(auto) : 'none',
        severity: 'block',
        message: `Auto liability required for delivery/pickup transport.`,
      });
    }
  }

  for (const e of req.endorsements) {
    if (!policy.endorsements.includes(e)) {
      issues.push({
        field: ENDORSEMENT_LABEL[e],
        required: 'required',
        actual: 'not on policy',
        severity: 'block',
        message: `${ENDORSEMENT_LABEL[e]} endorsement required by vendor.`,
      });
    }
  }

  if (shootDates) {
    if (policy.effectiveDate > shootDates.start) {
      issues.push({
        field: 'Effective date',
        required: `≤ ${shootDates.start}`,
        actual: policy.effectiveDate,
        severity: 'block',
        message: `Policy effective date is after shoot start.`,
      });
    }
    if (policy.expirationDate < shootDates.end) {
      issues.push({
        field: 'Expiration date',
        required: `≥ ${shootDates.end}`,
        actual: policy.expirationDate,
        severity: 'block',
        message: `Policy expires before shoot end.`,
      });
    } else {
      const daysToExpiry = Math.floor(
        (Date.parse(policy.expirationDate) - Date.parse(shootDates.end)) / 86_400_000,
      );
      if (daysToExpiry < 14) {
        issues.push({
          field: 'Expiration buffer',
          required: '≥ 14 days after shoot',
          actual: `${daysToExpiry} days`,
          severity: 'warn',
          message: `Policy expires soon after shoot end — consider renewing.`,
        });
      }
    }
  }

  const blocking = issues.some((i) => i.severity === 'block');
  return { status: blocking ? 'gap' : issues.length ? 'warning' : 'ok', issues };
}

export function summarizeCompatibility(r: CompatibilityResult): string {
  switch (r.status) {
    case 'not-required':
      return 'No COI required';
    case 'no-policy':
      return 'Add insurance to check';
    case 'ok':
      return 'Insurance OK';
    case 'warning':
      return `${r.issues.length} warning${r.issues.length === 1 ? '' : 's'}`;
    case 'gap':
      return `${r.issues.filter((i) => i.severity === 'block').length} coverage gap${
        r.issues.filter((i) => i.severity === 'block').length === 1 ? '' : 's'
      }`;
  }
}

export function buildBrokerCertEmail(args: {
  productionName: string;
  startDate: string;
  endDate: string;
  vendorSource: Source;
  insured: BusinessProfile;
}): { to: string; subject: string; body: string } {
  const req: CoiRequirements = VENDOR_COI[args.vendorSource];
  const lines = [
    `Hi ${args.insured.policy?.broker.name ?? ''},`,
    ``,
    `Please issue a certificate of insurance for the production below.`,
    ``,
    `Production: ${args.productionName}`,
    `Coverage dates: ${args.startDate} through ${args.endDate}`,
    `Insured: ${args.insured.companyName}`,
    `Policy: ${args.insured.policy?.carrier ?? ''} #${args.insured.policy?.policyNumber ?? ''}`,
    ``,
    `Certificate holder:`,
    `  ${req.certificateHolder.name}`,
    `  ${req.certificateHolder.address}`,
    ``,
    `Additional insured: ${req.additionalInsuredWording ?? req.certificateHolder.name}`,
    ``,
    `Required limits:`,
    `  • GL per occurrence: ${fmt(req.generalLiability.perOccurrence)}`,
    `  • GL aggregate: ${fmt(req.generalLiability.aggregate)}`,
    req.autoLiability ? `  • Auto liability: ${fmt(req.autoLiability)}` : '',
    ``,
    `Required endorsements:`,
    ...req.endorsements.map((e) => `  • ${ENDORSEMENT_LABEL[e]}`),
    ``,
    `Please reply with the PDF attached. Thank you.`,
    ``,
    `— ${args.insured.contact.name}`,
    args.insured.companyName,
  ].filter(Boolean);

  return {
    to: args.insured.policy?.broker.email ?? '',
    subject: `COI request — ${args.productionName} — ${req.certificateHolder.name}`,
    body: lines.join('\n'),
  };
}

function fmt(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}
