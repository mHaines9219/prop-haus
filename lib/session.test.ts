import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_ORG_ID, currentOrgId, currentPlan } from './session';

/**
 * The failure this guards against already happened once.
 *
 * `PLACEHOLDER_ORG_ID` is written into `events.org_id`, `usage_counters.org_id`
 * and `projects.org_id`, all of which are `references organizations(id)`. If no
 * such row exists the insert violates a foreign key — and because
 * `lib/analytics.ts` swallows its own errors so analytics can never 502 a search,
 * the failure is completely silent: the events table simply stays empty.
 *
 * So the constant and the seed migration have to agree, and nothing else in the
 * type system makes them. Changing one without the other is a one-character edit
 * with no visible symptom, which is exactly the kind of thing a test should hold.
 */

const MIGRATION = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260802013000_seed_placeholder_org.sql',
);

describe('PLACEHOLDER_ORG_ID', () => {
  it('is seeded by a migration, so the org_id foreign keys resolve', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain(PLACEHOLDER_ORG_ID);
  });

  it('is inserted into public.organizations idempotently', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    // Re-running migrations must not fail once real orgs exist alongside it.
    expect(sql).toMatch(/insert\s+into\s+public\.organizations/i);
    expect(sql).toMatch(/on\s+conflict\s*\(\s*id\s*\)\s*do\s+nothing/i);
  });

  it('is a syntactically valid uuid', () => {
    // A malformed uuid fails at insert time, not at compile time.
    expect(PLACEHOLDER_ORG_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('the session seam', () => {
  it('resolves an org id every request', async () => {
    await expect(currentOrgId()).resolves.toBe(PLACEHOLDER_ORG_ID);
  });

  it('defaults to the free plan so the paywall is exercised, not bypassed', async () => {
    // An unwired gate that always says yes is the same bug as no gate at all.
    await expect(currentPlan()).resolves.toBe('free');
  });
});
