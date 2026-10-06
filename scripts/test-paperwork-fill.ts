/**
 * Isolated Anvil fill test — no e-sign, no webhook, no project store.
 * Verifies that a template eid + our buildPayload() produce a populated PDF.
 *
 * Run:  pnpm test:fill
 * Needs: ANVIL_API_KEY in .env.local, and the template's env var set, e.g.
 *        ANVIL_TEMPLATE_RENTAL_HPR=Xy2FfPa14Ec9gZSD92Ym
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Source } from '../lib/types';
import type { BusinessProfile } from '../lib/insurance';
import type { PaperworkFormType } from '../lib/paperwork/schema';
import { buildPayload } from '../lib/paperwork/payload';
import { fillPdf, resolveTemplateEid } from '../lib/paperwork/anvil-client';

// --- the form/vendor under test ---
const VENDOR: Source = 'hpr';
const FORM: PaperworkFormType = 'rental_agreement';

const sampleProfile: BusinessProfile = {
  companyName: 'Lantern & Co. Productions',
  address: '4200 Lankershim Blvd, North Hollywood, CA 91602',
  contact: { name: 'Robin W Smith', email: 'robin@lanternco.example', phone: '323-555-0148' },
  paperwork: {
    signer: { name: 'Robin W Smith', title: 'Producer', email: 'robin@lanternco.example' },
    tradeRefs: [],
  },
};

async function main() {
  const eid = resolveTemplateEid({ type: FORM, vendor: VENDOR });
  if (!eid) {
    throw new Error(
      `No template eid resolved for ${FORM}/${VENDOR}. Set ANVIL_TEMPLATE_RENTAL_HPR in .env.local.`,
    );
  }
  const payload = buildPayload(FORM, sampleProfile, VENDOR, {
    projectId: 'testfill',
    productionName: 'Test Fill',
  });
  console.log(`Filling template ${eid} (${FORM}/${VENDOR}) with payload:`);
  console.log(JSON.stringify(payload, null, 2));

  const pdf = await fillPdf(eid, payload);
  const out = path.join(process.cwd(), 'tmp', `${VENDOR}-${FORM}.pdf`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pdf);
  console.log(`\n✅ Wrote ${pdf.length} bytes → ${out}`);
  console.log('Open it and confirm the print-name field is populated.');
}

main().catch((err) => {
  console.error('\n❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
