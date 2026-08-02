import { describe, expect, it } from 'vitest';

/**
 * The integration suite must not be able to report green while running nothing.
 *
 * WHY THIS TEST EXISTS
 *
 * Two suites gate themselves on credentials — `lib/auth-probe.test.ts:38` and
 * `lib/projects.test.ts:101`, both `describe.skipIf(!HAS_DB)`. That is the right
 * behaviour for a laptop with no `.env.local`: a mock of a live database would
 * be testing the one thing it cannot get wrong.
 *
 * But `skipIf` reports **green**. In any worktree or CI runner without
 * credentials the whole integration layer silently does not run, and the suite
 * says "0 failed" with total confidence. That is the vacuous-pass failure this
 * project hit three times in one afternoon — a plan-tier assertion that could
 * not fail, a fail-closed test whose guard was never exercised, an OpenAPI read
 * against an empty document — except at harness scale, where it hides ~19 tests
 * instead of one assertion.
 *
 * It surfaced when the same run was quoted as "103 passed" in one worktree and
 * "84 passed, 19 skipped" in another. Same commit, same command, and only the
 * second phrasing is a claim about anything.
 *
 * HOW IT FAILS CLOSED
 *
 * Absent credentials, the default is a RED build. Skipping the integration layer
 * becomes a deliberate act that has to be written on the command line:
 *
 *   ALLOW_SKIP_DB_TESTS=1 pnpm test
 *
 * That inversion is the whole point. An unconfigured CI runner goes red rather
 * than green, and a developer who genuinely has no database is told exactly what
 * to type — while the skip appears in their shell history instead of vanishing
 * into a passing summary.
 */

const HAS_DB = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const SKIP_ACKNOWLEDGED = process.env.ALLOW_SKIP_DB_TESTS === '1';

describe('integration suite canary', () => {
  it('either runs the integration tests or is told explicitly not to', () => {
    // Deliberately NOT skipIf — a canary that can skip itself is not a canary.
    expect(
      HAS_DB || SKIP_ACKNOWLEDGED,
      'The integration tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Without them lib/auth-probe.test.ts and lib/projects.test.ts skip silently and this\n' +
        'suite reports green while exercising no database at all.\n\n' +
        'Provide credentials, or acknowledge the gap explicitly:\n' +
        '  ALLOW_SKIP_DB_TESTS=1 pnpm test\n',
    ).toBe(true);
  });

  // The opt-out must not become a way to hide a broken configuration. Half a
  // credential pair is a misconfiguration, not an absent database, and it would
  // otherwise read as "no database" and skip.
  it('treats a half-configured credential pair as an error, not as absent', () => {
    const url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(
      url === key,
      `Exactly one of NEXT_PUBLIC_SUPABASE_URL (${url}) and SUPABASE_SERVICE_ROLE_KEY (${key}) ` +
        'is set. That is a broken environment rather than a database-free one, and the ' +
        'skipIf guards would read it as the latter.',
    ).toBe(true);
  });
});
