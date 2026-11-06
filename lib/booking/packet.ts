/**
 * The inquiry packet one house receives with the click: who is asking, the
 * W-9, word that a card is on file, and proof the production is insurable.
 * Pure, so the email composer and the booking record print the same lines.
 */

import { issuerLabel, packetInsuranceLine, type BookingInsurance } from '../insurance/route';
import type { PacketItem } from './machine';

export function inquiryPacket(input: { vendorName: string; w9OnFile: boolean; insurance: BookingInsurance }): PacketItem[] {
  return [
    {
      kind: 'info_sheet',
      label: 'Production info sheet',
      status: 'included',
      line: 'Production info sheet: the details in this email.',
    },
    input.w9OnFile
      ? { kind: 'w9', label: 'W-9', status: 'included', line: 'W-9 attached.' }
      : { kind: 'w9', label: 'W-9', status: 'to_follow', line: 'W-9 to follow.' },
    {
      kind: 'payment_on_file',
      label: 'Payment method on file',
      status: 'included',
      line: 'Payment method on file. Nothing is charged until pickup.',
    },
    {
      kind: 'insurability',
      label:
        input.insurance.route === 'on_file'
          ? 'COI on file'
          : input.insurance.route === 'own'
            ? `COI from ${issuerLabel(input.insurance)} on confirmation`
            : `Proof of insurability from ${issuerLabel(input.insurance)}`,
      status: 'included',
      line: packetInsuranceLine(input.vendorName, input.insurance),
    },
  ];
}
