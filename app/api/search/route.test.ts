import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// Relative, not '@/lib/events': the tsconfig path alias is not configured for
// Vitest, and lib/eval/metrics.test.ts uses relative imports for the same reason.
import { EVENT_TYPES } from '../../../lib/events';

/**
 * A merge already deleted this instrumentation once, silently.
 *
 * #22 and #14 both edited this handler. The conflict was resolved in favour of
 * the metering side, which dropped every `recordEvents` call while leaving the
 * import behind — so `main` shipped a search route that imported an analytics
 * helper it never called, and the events table would have stayed empty forever.
 * Nothing caught it: it typechecks (an unused import is not an error, and lint
 * is not configured), and no unit test touches the handler.
 *
 * These assertions read the route source rather than execute it, because the
 * failure mode is a *missing call*, not wrong behaviour in a call that runs.
 * Coarse, but it fails loudly the next time a merge eats one — which is the
 * only property being asked for.
 */

const ROUTE = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');

describe('search route instrumentation', () => {
  it('calls recordEvents rather than merely importing it', () => {
    expect(ROUTE).toMatch(/import\s*\{\s*recordEvents\s*\}/);
    // The exact symptom of the lost merge: imported, never invoked.
    const calls = ROUTE.match(/\brecordEvents\s*\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('records the demand signal the product brief leans on', () => {
    for (const type of ['search', 'vision_search', 'zero_result_search'] as const) {
      expect(ROUTE).toContain(`'${type}'`);
    }
  });

  it('records paywall_hit, which returns before all other instrumentation', () => {
    // The 402 path exits early, so it needs its own call or the ceiling — the one
    // request carrying real intent — leaves no trace at all.
    expect(ROUTE).toContain(`'paywall_hit'`);
    const paywallAt = ROUTE.indexOf(`'paywall_hit'`);
    const respondAt = ROUTE.indexOf('status: 402');
    expect(paywallAt).toBeGreaterThan(-1);
    expect(paywallAt).toBeLessThan(respondAt);
  });

  it('checks the allowance before calling the model, not after', () => {
    // Compare CALL SITES, not first occurrence — `indexOf('runSearch')` finds the
    // import line, which sits above every call and makes this assertion vacuous.
    const gateAt = ROUTE.indexOf('await getAllowance(');
    const modelAt = ROUTE.indexOf('await runSearch(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(modelAt).toBeGreaterThan(-1);
    // A spent allowance must 402 without spending money on a search.
    expect(gateAt).toBeLessThan(modelAt);
  });

  it('only emits event types the schema knows about', () => {
    const emitted = [...ROUTE.matchAll(/type:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(0);
    for (const type of emitted) {
      expect(EVENT_TYPES as readonly string[]).toContain(type);
    }
  });
});
