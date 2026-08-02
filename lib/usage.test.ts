import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A paywall that miscounts is the whole failure. Types cannot show any of this:
 * a counter that double-charges, one that never charges, one that leaks another
 * org's usage, or a lost update under concurrency that hands out free searches.
 *
 * `lib/usage.ts` resolves its store from `process.cwd()` at module load, so each
 * test chdirs into a fresh temp dir and re-imports.
 */

const PLAN = 'free' as const;
const AI = 'aiSearchesPerMonth' as const;
const VISION = 'visionSearches' as const;
const ORG = 'org-a';

let dir: string;
let cwd: string;
let U: typeof import('./usage');

beforeEach(async () => {
  cwd = process.cwd();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ph-usage-'));
  await fs.mkdir(path.join(dir, 'data'));
  process.chdir(dir);
  vi.resetModules();
  U = await import('./usage');
});

afterEach(async () => {
  process.chdir(cwd);
  await fs.rm(dir, { recursive: true, force: true });
});

describe('getAllowance', () => {
  it('starts at zero used and reports the plan ceiling', async () => {
    const a = await U.getAllowance(ORG, PLAN, AI);
    expect(a.used).toBe(0);
    expect(a.limit).toBe(20);
    expect(a.remaining).toBe(20);
    expect(a.allowed).toBe(true);
  });

  it('never consumes — checking is free', async () => {
    // The zero-result search path calls this instead of recordUsage, so if it
    // consumed, every failed search would still be billed.
    for (let i = 0; i < 5; i++) await U.getAllowance(ORG, PLAN, AI);
    expect((await U.getAllowance(ORG, PLAN, AI)).used).toBe(0);
  });
});

describe('recordUsage', () => {
  it('consumes one and returns the standing after', async () => {
    expect((await U.recordUsage(ORG, PLAN, AI)).used).toBe(1);
    expect((await U.recordUsage(ORG, PLAN, AI)).used).toBe(2);
    expect((await U.getAllowance(ORG, PLAN, AI)).remaining).toBe(18);
  });

  it('closes the gate exactly at the limit, not one past it', async () => {
    for (let i = 0; i < 20; i++) await U.recordUsage(ORG, PLAN, AI);
    const a = await U.getAllowance(ORG, PLAN, AI);
    expect(a.used).toBe(20);
    expect(a.remaining).toBe(0);
    expect(a.allowed).toBe(false);
  });

  it('counts every write under concurrency', async () => {
    // Read-modify-write on a file: without the serializer in lib/usage.ts these
    // ten collapse to one, which is nine free searches and completely silent.
    await Promise.all(Array.from({ length: 10 }, () => U.recordUsage(ORG, PLAN, AI)));
    expect((await U.getAllowance(ORG, PLAN, AI)).used).toBe(10);
  });
});

describe('isolation between metrics, orgs and periods', () => {
  it('keeps vision and text allowances separate', async () => {
    await U.recordUsage(ORG, PLAN, AI);
    expect((await U.getAllowance(ORG, PLAN, VISION)).used).toBe(0);
    expect((await U.getAllowance(ORG, PLAN, VISION)).limit).toBe(3);
  });

  it('never lets one org’s usage touch another’s', async () => {
    await U.recordUsage('org-a', PLAN, AI);
    await U.recordUsage('org-a', PLAN, AI);
    await U.recordUsage('org-b', PLAN, AI);
    expect((await U.getAllowance('org-a', PLAN, AI)).used).toBe(2);
    expect((await U.getAllowance('org-b', PLAN, AI)).used).toBe(1);
    expect((await U.getAllowance('org-c', PLAN, AI)).used).toBe(0);
  });

  it('resets the monthly metric across a month boundary', async () => {
    const aug = new Date('2026-08-15T00:00:00Z');
    const sep = new Date('2026-09-01T00:00:00Z');
    await U.recordUsage(ORG, PLAN, AI, aug);
    expect((await U.getAllowance(ORG, PLAN, AI, aug)).used).toBe(1);
    expect((await U.getAllowance(ORG, PLAN, AI, sep)).used).toBe(0);
  });

  it('does NOT reset the lifetime metric across a month boundary', async () => {
    const aug = new Date('2026-08-15T00:00:00Z');
    const sep = new Date('2026-09-01T00:00:00Z');
    await U.recordUsage(ORG, PLAN, VISION, aug);
    // visionSearches is a lifetime trial — a new month must not refill it.
    expect((await U.getAllowance(ORG, PLAN, VISION, sep)).used).toBe(1);
  });
});

describe('paid plans', () => {
  it('are unlimited and always allowed', async () => {
    const a = await U.getAllowance(ORG, 'pro', AI);
    expect(a.limit).toBeNull();
    expect(a.remaining).toBeNull();
    expect(a.allowed).toBe(true);
  });

  it('stay allowed after heavy use', async () => {
    for (let i = 0; i < 50; i++) await U.recordUsage(ORG, 'pro', AI);
    expect((await U.getAllowance(ORG, 'pro', AI)).allowed).toBe(true);
  });
});

describe('usageSnapshot', () => {
  it('reports both metrics in one read', async () => {
    await U.recordUsage(ORG, PLAN, AI);
    const snap = await U.usageSnapshot(ORG, PLAN);
    expect(snap.aiSearchesPerMonth.used).toBe(1);
    expect(snap.visionSearches.used).toBe(0);
  });
});
