/**
 * How a house gets its certificate, read off what the production has on file.
 * Pure, so the composer, the booking store and the order page agree.
 *
 *   on_file  the production already holds a certificate: it goes in the
 *            inquiry packet and the certificate step is done at confirmation.
 *   own      the production has its own policy (and usually a broker): the
 *            broker is asked for a certificate naming the house when the house
 *            confirms, and the certificate arrives from them.
 *   athos    nothing on file: the fallback insurer proves insurability at
 *            inquiry and issues the certificate on confirmation.
 *
 * Prop Haus issues nothing on any route.
 */

import { INSURER_NAME } from './issuer';
import type { InsuranceProfile } from './minimums';

export const INSURANCE_ROUTES = ['on_file', 'own', 'athos'] as const;
export type InsuranceRoute = (typeof INSURANCE_ROUTES)[number];

export type BookingInsurance = {
  route: InsuranceRoute;
  /** The broker a certificate is requested from, on the `own` route. */
  brokerName?: string;
  brokerEmail?: string;
  /** The certificate already on file, on the `on_file` route. */
  documentName?: string;
};

export function insuranceRouteFor(insurance: InsuranceProfile): BookingInsurance {
  if (insurance.coiDocument) return { route: 'on_file', documentName: insurance.coiDocument.name };
  const hasPolicy = Boolean(insurance.carrier || insurance.policyNumber || insurance.glLimit);
  const broker = insurance.broker;
  if (hasPolicy || broker?.name || broker?.email) {
    return {
      route: 'own',
      ...(broker?.name ? { brokerName: broker.name } : {}),
      ...(broker?.email ? { brokerEmail: broker.email } : {}),
    };
  }
  return { route: 'athos' };
}

/** Who the certificate comes from, as a short name for copy. */
export function issuerLabel(insurance: BookingInsurance): string {
  switch (insurance.route) {
    case 'on_file':
      return 'on file';
    case 'own':
      return insurance.brokerName ?? 'our insurer';
    case 'athos':
      return INSURER_NAME;
  }
}

/** The insurance line of the inquiry packet, per route. */
export function packetInsuranceLine(vendorName: string, insurance: BookingInsurance): string {
  switch (insurance.route) {
    case 'on_file':
      return 'COI on file attached.';
    case 'own':
      return `COI naming ${vendorName} follows from ${insurance.brokerName ? `our broker, ${insurance.brokerName},` : 'our insurer'} when you confirm.`;
    case 'athos':
      return `Proof of insurability from ${INSURER_NAME}. A certificate naming ${vendorName} is issued when you confirm.`;
  }
}
