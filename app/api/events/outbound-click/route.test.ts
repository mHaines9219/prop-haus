import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// Relative, not '@/…': the tsconfig path alias is not configured for Vitest.
// See app/api/search/route.test.ts for why these read source rather than import
// the handler — the `@/` imports inside it will not resolve here.
import { EVENT_TYPES } from '../../../../lib/events';

const ROUTE = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
const LINK = fs.readFileSync(
  path.join(__dirname, '../../../../components/ap/outbound-link.tsx'),
  'utf8',
);

/**
 * The demand beacon (MVP-6 emulate #1) is a wiring seam across three files: an
 * event-stream type, a validating route, and a client link that fires the
 * beacon. Each can be silently severed by a merge without breaking the type
 * check — the failure mode the search-route test was written for. These
 * assertions guard the wiring, not runtime behaviour.
 */

describe('outbound-click beacon', () => {
  it('is a recorded event type, so logEvent will accept it', () => {
    expect(EVENT_TYPES).toContain('outbound_click');
  });

  it('records rather than merely importing recordEvents', () => {
    expect(ROUTE).toMatch(/import\s*\{\s*recordEvents\s*\}/);
    expect(ROUTE).toMatch(/\brecordEvents\s*\(/);
    expect(ROUTE).toContain(`'outbound_click'`);
  });

  it('validates the vendor against SOURCE_META instead of trusting the body', () => {
    // A forged beacon must not be able to invent a vendor into the demand data.
    expect(ROUTE).toContain('SOURCE_META');
    expect(ROUTE).toMatch(/isSource/);
  });

  it('takes the signal, not the proxy: the outbound href stays direct', () => {
    // The whole point of emulate #1 vs GetSet is no link proxying. The link
    // beacons AND navigates directly — never routes the href through us.
    expect(LINK).toContain('navigator.sendBeacon');
    expect(LINK).toMatch(/href=\{href\}/);
  });
});
