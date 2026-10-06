/**
 * Isolated Etch packet test — fill + create a signable packet, no project store needed.
 * Verifies: API key, template eid, field mapping, the signature field alias, and that
 * Anvil issues the packet (the signer receives a signing email).
 *
 * Run:  SIGNER_EMAIL=you@example.com pnpm test:packet
 * Needs: ANVIL_API_KEY and ANVIL_TEMPLATE_RENTAL_HPR in .env.local.
 *        SIGNER_EMAIL must be an inbox you can open to complete signing.
 */
import type { Source } from '../lib/types';
import type { BusinessProfile } from '../lib/insurance';
import type { PaperworkFormType } from '../lib/paperwork/schema';
import { buildPayload } from '../lib/paperwork/payload';
import { createEtchPacket, resolveTemplateEid } from '../lib/paperwork/anvil-client';

const VENDOR: Source = 'hpr';
const FORM: PaperworkFormType = 'rental_agreement';

const signerEmail = process.env.SIGNER_EMAIL;
const signerName = process.env.SIGNER_NAME ?? 'Robin W Smith';

const sampleProfile: BusinessProfile = {
  companyName: 'Lantern & Co. Productions',
  address: '4200 Lankershim Blvd, North Hollywood, CA 91602',
  contact: { name: signerName, email: signerEmail ?? 'robin@lanternco.example', phone: '323-555-0148' },
  paperwork: {
    signer: { name: signerName, title: 'Producer', email: signerEmail ?? 'robin@lanternco.example' },
    tradeRefs: [],
  },
};

async function main() {
  if (!signerEmail) throw new Error('Set SIGNER_EMAIL to an inbox you can open.');
  const eid = resolveTemplateEid({ type: FORM, vendor: VENDOR });
  if (!eid) throw new Error('Set ANVIL_TEMPLATE_RENTAL_HPR in .env.local.');

  const payload = buildPayload(FORM, sampleProfile, VENDOR, {
    projectId: 'testpacket',
    productionName: 'Test Packet',
  }) as Record<string, unknown>;

  console.log(`Creating Etch packet: ${FORM}/${VENDOR}, template ${eid}, signer ${signerEmail}`);
  const { eid: packetEid } = await createEtchPacket({
    name: 'Test Packet — HPR paperwork',
    signerEmail,
    signerName,
    files: [{ id: FORM, templateEid: eid }],
    payloads: { [FORM]: { data: payload } },
  });

  console.log(`\n✅ Packet created: ${packetEid}`);
  console.log(`Check ${signerEmail} for the signing email (test packets are watermarked/non-binding).`);
}

main().catch((err) => {
  console.error('\n❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
