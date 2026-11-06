import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/test/mocks/supabase-admin';
import { appendIntakeMessages, listIntakeMessages } from './store';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

beforeEach(() => db.reset());

describe('intake transcript', () => {
  it('reads back what was appended, in order, for that project only', async () => {
    await appendIntakeMessages('p1', [
      { role: 'user', content: 'A film in Brooklyn' },
      { role: 'assistant', content: 'How many crew?', questionKeys: ['crew.count'] },
      { role: 'user', content: '15' },
    ]);
    await appendIntakeMessages('p2', [{ role: 'user', content: 'Other project' }]);

    const messages = await listIntakeMessages('p1');
    expect(messages.map(({ role, content, questionKeys }) => ({ role, content, questionKeys }))).toEqual([
      { role: 'user', content: 'A film in Brooklyn', questionKeys: undefined },
      { role: 'assistant', content: 'How many crew?', questionKeys: ['crew.count'] },
      { role: 'user', content: '15', questionKeys: undefined },
    ]);
    expect(messages.every((m) => typeof m.id === 'string' && m.id.length > 0)).toBe(true);
    const stamps = messages.map((m) => Date.parse(m.createdAt));
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(new Set(stamps).size).toBe(3);
  });

  it('omits questionKeys when none were asked, and drops non-string keys from the row', async () => {
    db.seed('project_intake_messages', [
      { id: 'm1', project_id: 'p1', role: 'assistant', content: 'a', question_keys: ['risks', 7, null], created_at: '2026-11-01T00:00:00.000Z' },
      { id: 'm2', project_id: 'p1', role: 'assistant', content: 'b', question_keys: null, created_at: '2026-11-01T00:00:01.000Z' },
      { id: 'm3', project_id: 'p1', role: 'user', content: 'c', question_keys: [], created_at: '2026-11-01T00:00:02.000Z' },
    ]);
    const [a, b, c] = await listIntakeMessages('p1');
    expect(a).toEqual({ id: 'm1', role: 'assistant', content: 'a', questionKeys: ['risks'], createdAt: '2026-11-01T00:00:00.000Z' });
    expect(b).not.toHaveProperty('questionKeys');
    expect(c).not.toHaveProperty('questionKeys');
  });

  it('is empty for a project with no transcript', async () => {
    expect(await listIntakeMessages('p1')).toEqual([]);
  });

  it('writes nothing for an empty batch', async () => {
    db.failNext('project_intake_messages', 'insert', 'should not be reached');
    await expect(appendIntakeMessages('p1', [])).resolves.toBeUndefined();
    expect(db.rows('project_intake_messages')).toEqual([]);
  });

  it('throws when a read or a write fails', async () => {
    db.failNext('project_intake_messages', 'select', 'timeout');
    await expect(listIntakeMessages('p1')).rejects.toThrow('listIntakeMessages: timeout');
    db.reset();
    db.failNext('project_intake_messages', 'insert', 'disk full');
    await expect(appendIntakeMessages('p1', [{ role: 'user', content: 'x' }])).rejects.toThrow('appendIntakeMessages: disk full');
  });
});
