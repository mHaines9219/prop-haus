/**
 * The certificate a house gets when it confirms, and who issues it.
 *
 * Prop Haus is never the issuer. In the booking flow the insurer (ATHOS)
 * issues one certificate per house from terms that house gave once, at
 * onboarding. This module is the seam to that insurer; the only
 * implementation today is the sandbox, which writes a record and produces no
 * document.
 */

import type { Vendor } from '../vendors';
import type { VendorInsuranceMinimum } from './minimums';

/** The insurer named in the booking flow. A label, not an integration. */
export const INSURER_NAME = 'ATHOS';

/** What a house stores once so its certificates can be issued without a back-and-forth. */
export type CertificateTerms = {
  holderName: string;
  /** Absent until the house gives one at onboarding. */
  holderAddress?: string;
  additionalInsuredWording: string;
  glLimit: number;
  aggregateLimit: number;
  coverageStart?: string;
  coverageEnd?: string;
};

export type Certificate = CertificateTerms & {
  certificateNumber: string;
  issuer: string;
  issuedAt: string;
};

export interface CertificateIssuer {
  issue(params: { orderId: string; vendorId: string; terms: CertificateTerms }): Promise<Certificate>;
}

// PLACEHOLDER: until a house's own limits are on file (vendor_insurance_minimums).
const DEFAULT_GL_LIMIT = 1_000_000;
const DEFAULT_AGGREGATE_LIMIT = 2_000_000;

/**
 * The terms for one house on one order.
 *
 * PLACEHOLDER: no house has given its certificate holder address or its
 * additional-insured wording yet. The holder is the house's name, the wording
 * is a generic sentence, and the coverage dates rule is "the rental window".
 * Each becomes that house's own data once vendor onboarding collects it.
 */
export function certificateTerms(
  vendor: Pick<Vendor, 'name'>,
  minimum: VendorInsuranceMinimum | undefined,
  rental: { start?: string; end?: string },
): CertificateTerms {
  return {
    holderName: vendor.name,
    additionalInsuredWording: `${vendor.name} is named as additional insured and loss payee for rented property.`,
    glLimit: minimum?.glLimit ?? DEFAULT_GL_LIMIT,
    aggregateLimit: minimum?.aggregateLimit ?? DEFAULT_AGGREGATE_LIMIT,
    ...(rental.start ? { coverageStart: rental.start } : {}),
    ...(rental.end ? { coverageEnd: rental.end } : {}),
  };
}

/** Records the certificate the insurer would issue. No document, no insurer call. */
export class SandboxIssuer implements CertificateIssuer {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async issue({ orderId, vendorId, terms }: { orderId: string; vendorId: string; terms: CertificateTerms }) {
    return {
      ...terms,
      certificateNumber: `SBX-${orderId.slice(0, 8).toUpperCase()}-${vendorId.toUpperCase()}`,
      issuer: `${INSURER_NAME} (sandbox)`,
      issuedAt: this.now().toISOString(),
    };
  }
}

export const certificateIssuer: CertificateIssuer = new SandboxIssuer();
