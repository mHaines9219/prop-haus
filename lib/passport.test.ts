import { describe, expect, it } from 'vitest';
import { EMPTY_ORDER_PROFILE } from './order-profile';
import {
  PASSPORT_KINDS,
  isExpired,
  isPassportKind,
  normalizeDocumentPatch,
  normalizePassport,
  passportSummary,
  resolvePassport,
  type PassportDocument,
} from './passport';

const DOC: PassportDocument = {
  storagePath: 'org/passport/a.pdf',
  name: 'a.pdf',
  mime: 'application/pdf',
  uploadedAt: '2026-09-01T00:00:00Z',
};

describe('normalizePassport', () => {
  it('keeps well-formed stored slots and drops junk, blanks, and the coi key', () => {
    const out = normalizePassport({
      documents: {
        w9: { ...DOC, reference: '  ', expiresAt: '2027-01-01' },
        drivers_license: { name: 'no-path.pdf' },
        coi: DOC,
        unknown_kind: DOC,
      },
      extra: true,
    });
    expect(out).toEqual({ documents: { w9: { ...DOC, expiresAt: '2027-01-01' } } });
  });

  it('returns an empty passport for anything that is not an object', () => {
    expect(normalizePassport(null)).toEqual({ documents: {} });
    expect(normalizePassport([DOC])).toEqual({ documents: {} });
  });

  it('normalizes a metadata patch to trimmed strings or undefined', () => {
    expect(normalizeDocumentPatch({ expiresAt: ' 2027-01-01 ', reference: '', bogus: 1 })).toEqual({
      expiresAt: '2027-01-01',
      reference: undefined,
    });
  });
});

describe('resolvePassport', () => {
  it('shows the order profile COI in the coi slot with its expiry and policy number', () => {
    const profile = {
      ...EMPTY_ORDER_PROFILE,
      insurance: {
        policyNumber: 'GL-1',
        expiresAt: '2027-03-01',
        coiDocument: { storagePath: 'org/coi/x.pdf', name: 'x.pdf', uploadedAt: '2026-09-02T00:00:00Z' },
      },
    };
    const out = resolvePassport({ documents: { w9: DOC } }, profile);
    expect(out.documents.w9).toEqual(DOC);
    expect(out.documents.coi).toEqual({
      storagePath: 'org/coi/x.pdf',
      name: 'x.pdf',
      uploadedAt: '2026-09-02T00:00:00Z',
      mime: 'application/pdf',
      expiresAt: '2027-03-01',
      reference: 'GL-1',
    });
  });

  it('leaves the coi slot empty when the order profile has no certificate', () => {
    const out = resolvePassport({ documents: { coi: DOC } }, EMPTY_ORDER_PROFILE);
    expect(out.documents.coi).toBeUndefined();
  });
});

describe('passportSummary', () => {
  const now = new Date('2026-09-22T12:00:00Z');

  it('counts slots on file, names the missing ones, and flags expired documents', () => {
    const out = passportSummary(
      { documents: { w9: DOC, drivers_license: { ...DOC, expiresAt: '2026-01-01' } } },
      now,
    );
    expect(out.onFile).toBe(2);
    expect(out.total).toBe(PASSPORT_KINDS.length);
    expect(out.expired).toEqual(["Driver's license"]);
    expect(out.missing).toEqual([
      'Certificate of insurance',
      'Business license',
      'Resale / tax-exempt certificate',
      'Voided check or bank letter',
    ]);
  });

  it('treats missing or unparseable expiry as not expired', () => {
    expect(isExpired(undefined, now)).toBe(false);
    expect(isExpired('someday', now)).toBe(false);
    expect(isExpired('2030-01-01', now)).toBe(false);
    expect(isExpired('2020-01-01', now)).toBe(true);
  });
});

describe('isPassportKind', () => {
  it('accepts the known kinds only', () => {
    expect(isPassportKind('w9')).toBe(true);
    expect(isPassportKind('coi')).toBe(true);
    expect(isPassportKind('passport')).toBe(false);
    expect(isPassportKind(3)).toBe(false);
  });
});
