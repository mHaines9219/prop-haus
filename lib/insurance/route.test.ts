import { describe, expect, it } from 'vitest';
import { insuranceRouteFor, issuerLabel, packetInsuranceLine } from './route';

describe('insuranceRouteFor', () => {
  it('a certificate on file wins over everything', () => {
    const route = insuranceRouteFor({
      carrier: 'Hiscox',
      broker: { name: 'Acme' },
      coiDocument: { storagePath: 'org/coi.pdf', name: 'COI.pdf', uploadedAt: '2026-10-01T00:00:00Z' },
    });
    expect(route).toEqual({ route: 'on_file', documentName: 'COI.pdf' });
    expect(packetInsuranceLine('Omega', route)).toBe('COI on file attached.');
  });

  it('a policy or a broker on file means the production brings its own certificate', () => {
    expect(insuranceRouteFor({ carrier: 'Hiscox' })).toEqual({ route: 'own' });
    expect(insuranceRouteFor({ broker: { email: 'certs@acme.example' } })).toEqual({ route: 'own', brokerEmail: 'certs@acme.example' });
    const named = insuranceRouteFor({ glLimit: 1_000_000, broker: { name: 'Acme', email: 'certs@acme.example' } });
    expect(named).toEqual({ route: 'own', brokerName: 'Acme', brokerEmail: 'certs@acme.example' });
    expect(packetInsuranceLine('Omega', named)).toBe('COI naming Omega follows from our broker, Acme, when you confirm.');
    expect(packetInsuranceLine('Omega', { route: 'own' })).toBe('COI naming Omega follows from our insurer when you confirm.');
    expect(issuerLabel({ route: 'own' })).toBe('our insurer');
  });

  it('nothing on file falls back to ATHOS', () => {
    const route = insuranceRouteFor({});
    expect(route).toEqual({ route: 'athos' });
    expect(issuerLabel(route)).toBe('ATHOS');
    expect(packetInsuranceLine('Omega', route)).toBe(
      'Proof of insurability from ATHOS. A certificate naming Omega is issued when you confirm.',
    );
  });
});
