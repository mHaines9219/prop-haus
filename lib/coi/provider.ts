/**
 * COI provider interface.
 *
 * The licensed partner underwrites, binds, and issues coverage.
 * Prop Haus is the workflow and integration layer — not the insurer.
 *
 * Swap in a real adapter by setting COI_PROVIDER=<name> and implementing
 * the CoiProvider interface in a single adapter file. The mock provider is
 * the default and is fully demoable without any secrets.
 */

export type InsuranceProfile = {
  /** Policy number or reference from the partner system. */
  policyRef?: string;
  /** Named insured — usually the production company / org name. */
  namedInsured: string;
  /** General liability limit in dollars (e.g. 1_000_000). */
  glLimit: number;
  /** Aggregate limit in dollars (e.g. 2_000_000). */
  aggregateLimit: number;
  /** Workers comp limit, if applicable. */
  workersCompLimit?: number;
  /** Additional insured endorsement available? */
  additionalInsuredAvailable: boolean;
  /** ISO date string of policy expiry. */
  expiresAt?: string;
};

export type CertificateRequest = {
  orgId: string;
  orgName: string;
  insuranceProfile: InsuranceProfile;
  /** The vendor receiving the certificate. */
  vendorId: string;
  vendorName: string;
  /** COI requirements from the vendor. */
  requirements: {
    glLimit: number;
    aggregateLimit: number;
    workersCompRequired: boolean;
    additionalInsuredRequired: boolean;
  };
  /** Rental window dates — ISO strings. */
  rentalStartDate?: string;
  rentalEndDate?: string;
  /** Order reference for correlation. */
  orderId?: string;
};

export type IssuedCertificate = {
  /** External certificate ID from the partner system. */
  externalId: string;
  /** URL to the PDF certificate. */
  documentUrl: string;
  /** ISO string — when coverage starts. */
  effectiveDate: string;
  /** ISO string — when coverage expires. */
  expiryDate: string;
  /** Raw certificate data for display. */
  coverageSummary: {
    glLimit: number;
    aggregateLimit: number;
    namedInsured: string;
    additionalInsuredName?: string;
  };
};

export type PolicyResult = {
  policyRef: string;
  status: 'active' | 'pending' | 'lapsed';
};

export interface CoiProvider {
  /**
   * Fetch or create a policy for the org. Called once per org before issuance.
   * For mock: always returns a synthetic policy ref.
   */
  getOrCreatePolicy(orgId: string, profile: InsuranceProfile): Promise<PolicyResult>;

  /**
   * Issue a certificate of insurance for one vendor.
   * Returns the certificate data including a PDF URL.
   */
  issueCertificate(req: CertificateRequest): Promise<IssuedCertificate>;

  /**
   * Retrieve a previously issued certificate by its external ID.
   */
  getCertificate(externalId: string): Promise<IssuedCertificate | null>;
}

// ---------------------------------------------------------------------------
// Mock provider — zero secrets required; returns realistic fake data.
// ---------------------------------------------------------------------------

export class MockCoiProvider implements CoiProvider {
  async getOrCreatePolicy(orgId: string, profile: InsuranceProfile): Promise<PolicyResult> {
    return {
      policyRef: `MOCK-POL-${orgId.slice(0, 8).toUpperCase()}`,
      status: 'active',
    };
  }

  async issueCertificate(req: CertificateRequest): Promise<IssuedCertificate> {
    const certId = `MOCK-CERT-${req.vendorId.toUpperCase()}-${Date.now()}`;
    const effectiveDate = req.rentalStartDate ?? new Date().toISOString().slice(0, 10);
    const expiryRaw = req.rentalEndDate
      ? req.rentalEndDate
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    return {
      externalId: certId,
      // PLACEHOLDER: replace with real partner PDF endpoint once partner is chosen
      documentUrl: `https://mock-coi-provider.example.com/certificates/${certId}.pdf`,
      effectiveDate,
      expiryDate: expiryRaw,
      coverageSummary: {
        glLimit: req.insuranceProfile.glLimit,
        aggregateLimit: req.insuranceProfile.aggregateLimit,
        namedInsured: req.insuranceProfile.namedInsured,
        additionalInsuredName: req.vendorName,
      },
    };
  }

  async getCertificate(externalId: string): Promise<IssuedCertificate | null> {
    // Mock: reconstruct a plausible certificate from the ID
    if (!externalId.startsWith('MOCK-CERT-')) return null;
    return {
      externalId,
      documentUrl: `https://mock-coi-provider.example.com/certificates/${externalId}.pdf`,
      effectiveDate: new Date().toISOString().slice(0, 10),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      coverageSummary: {
        glLimit: 1_000_000,
        aggregateLimit: 2_000_000,
        namedInsured: 'Mock Production Co.',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory — reads COI_PROVIDER env var; defaults to mock.
// Add new adapters here when the partner is selected.
// ---------------------------------------------------------------------------

let _provider: CoiProvider | null = null;

export function getCoiProvider(): CoiProvider {
  if (_provider) return _provider;

  const name = process.env.COI_PROVIDER ?? 'mock';

  switch (name) {
    case 'mock':
      _provider = new MockCoiProvider();
      break;
    // PLACEHOLDER: case 'acord': _provider = new AcordAdapter(); break;
    // PLACEHOLDER: case 'coi-fast': _provider = new CoiFastAdapter(); break;
    default:
      console.warn(`[coi] Unknown COI_PROVIDER "${name}", falling back to mock`);
      _provider = new MockCoiProvider();
  }

  return _provider;
}
