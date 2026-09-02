import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { listIntakeMessages } from './store';
import { runIntakeTurn } from './turn';

/**
 * One intake turn end to end with the mock extractor: the profile lands on the
 * project row, the transcript records both sides with the question keys, and
 * the checklist that comes back is the one the stored profile produces. Then a
 * one-word answer to the question the assistant asked lands on the right field.
 */

const T = '2026-09-01T00:00:00.000Z';
const P = 'proj-1';

const BROOKLYN =
  'I’m producing a 10-day indie film in Brooklyn. We’re renting furniture and props from several vendors. We have 15 crew members, two locations, one child actor, a stunt scene, and a rented box truck.';

function seedProject(id = P, org = ORG_ID) {
  db.seed('projects', [{ id, org_id: org, name: 'Nocturne', created_at: T, updated_at: T, archived_at: null, profile: {} }]);
  db.seed('project_folders', [
    { id: `${id}-scene`, project_id: id, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { id: `${id}-paper`, project_id: id, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

beforeEach(() => {
  db.reset();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.relation('project_documents', 'project_requirements', 'document_id');
  process.env.INTAKE_PROVIDER = 'mock';
});

describe('runIntakeTurn', () => {
  it('is null for a project the org does not own, and writes nothing', async () => {
    seedProject(P, OTHER_ORG_ID);
    expect(await runIntakeTurn(ORG_ID, P, BROOKLYN)).toBeNull();
    expect(db.rows('project_intake_messages')).toHaveLength(0);
  });

  it('turns the description into the profile, the reply, the next question, and the checklist', async () => {
    seedProject();
    const turn = await runIntakeTurn(ORG_ID, P, BROOKLYN, 'free', { userId: 'u1' });
    expect(turn).not.toBeNull();
    if (!turn) return;

    expect(turn.provider).toBe('mock');
    expect(turn.profile).toEqual({
      productionType: 'film',
      schedule: { shootDays: 10 },
      locations: { city: 'Brooklyn', region: 'NY', count: 2 },
      crew: { count: 15 },
      cast: { count: 1, minors: true },
      rentals: { props: true, furniture: true, vendorCount: 3 },
      vehicles: { rentedTrucks: true },
      risks: { stunts: true },
    });
    expect(db.rows('projects')[0].profile).toEqual(turn.profile);

    expect(turn.questions.map((q) => q.key)).toEqual(['locations.publicProperty']);
    expect(turn.reply).toContain('Noted: Film');
    expect(turn.reply).toContain('Any shooting on streets, parks, or other public property?');
    expect(turn.facts.find((f) => f.label === 'Crew')?.value).toBe('15');

    const ids = turn.checklist.items.map((i) => i.requirementId);
    expect(ids).toContain('prop_inventory_condition_log');
    expect(ids).toContain('minor_release');
    expect(ids).toContain('safety_risk_assessment');
    expect(turn.checklist.advisories.map((a) => a.id)).toEqual(['insurance_review', 'minors_review']);

    const transcript = await listIntakeMessages(P);
    expect(transcript.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(transcript[0].content).toBe(BROOKLYN);
    expect(transcript[1].questionKeys).toEqual(['locations.publicProperty']);

    expect(db.rows('events').at(-1)).toMatchObject({
      type: 'project_intake',
      user_id: 'u1',
      payload: { projectId: P, provider: 'mock', open: 1 },
    });
  });

  it('routes a one-word answer to the question that was asked, then asks nothing more', async () => {
    seedProject();
    await runIntakeTurn(ORG_ID, P, BROOKLYN);
    const turn = await runIntakeTurn(ORG_ID, P, 'No');
    if (!turn) throw new Error('expected a turn');

    expect(turn.profile.locations?.publicProperty).toBe(false);
    expect(turn.questions).toEqual([]);
    expect(turn.reply).toContain('That covers what the checklist needs.');
    expect(turn.checklist.items.map((i) => i.requirementId)).not.toContain('film_permit');
    expect((await listIntakeMessages(P)).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('keeps the short-answer patch when the extractor fails', async () => {
    seedProject();
    await runIntakeTurn(ORG_ID, P, 'A commercial with a venue at the Foundry');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { MockIntakeExtractor } = await import('./extract');
    const spy = vi.spyOn(MockIntakeExtractor.prototype, 'extract').mockRejectedValueOnce(new Error('boom'));

    const before = db.rows('projects')[0].profile as { venue?: { requiresCoi?: boolean } };
    expect(before.venue?.requiresCoi).toBeUndefined();

    const transcript = await listIntakeMessages(P);
    expect(transcript.at(-1)?.questionKeys?.[0]).toBe('schedule');
    const turn = await runIntakeTurn(ORG_ID, P, '3 days');
    expect(turn?.profile.schedule?.shootDays).toBe(3);
    expect(turn?.reply).toContain('Noted: schedule 3 days');
    spy.mockRestore();
  });
});
