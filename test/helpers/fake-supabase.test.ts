import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase } from './fake-supabase';

/**
 * The fake is the floor every mocked route and lib test stands on, so its
 * PostgREST semantics are pinned here: cardinality errors, unique violations,
 * counts, embeds, dotted filters, storage. A drift here would silently turn
 * every dependent test vacuous.
 */

let db: FakeSupabase;
beforeEach(() => {
  db = new FakeSupabase();
});

describe('select', () => {
  beforeEach(() => {
    db.seed('things', [
      { id: 't1', org_id: 'a', n: 2, tags: ['x', 'y'], created_at: '2026-01-02' },
      { id: 't2', org_id: 'a', n: 1, tags: ['y'], created_at: '2026-01-03' },
      { id: 't3', org_id: 'b', n: 3, tags: null, created_at: '2026-01-01' },
    ]);
  });

  it('filters, orders and projects', async () => {
    const { data, error } = await db
      .client()
      .from('things')
      .select('id, n')
      .eq('org_id', 'a')
      .order('n', { ascending: false });
    expect(error).toBeNull();
    expect(data).toEqual([
      { id: 't1', n: 2 },
      { id: 't2', n: 1 },
    ]);
  });

  it('supports in, neq, gte, is, overlaps, ilike, match and or', async () => {
    const c = db.client();
    expect((await c.from('things').select('id').in('id', ['t1', 't3'])).data).toHaveLength(2);
    expect((await c.from('things').select('id').neq('org_id', 'a')).data).toEqual([{ id: 't3' }]);
    expect((await c.from('things').select('id').gte('n', 2)).data).toHaveLength(2);
    expect((await c.from('things').select('id').is('tags', null)).data).toEqual([{ id: 't3' }]);
    expect((await c.from('things').select('id').overlaps('tags', ['x'])).data).toEqual([{ id: 't1' }]);
    expect((await c.from('things').select('id').ilike('id', 'T%')).data).toHaveLength(3);
    expect((await c.from('things').select('id').match({ org_id: 'b' })).data).toEqual([{ id: 't3' }]);
    expect((await c.from('things').select('id').or('id.eq.t1,n.eq.3')).data).toHaveLength(2);
  });

  it('single errors on zero or many rows; maybeSingle only on many', async () => {
    const c = db.client();
    const none = await c.from('things').select('*').eq('id', 'nope').single();
    expect(none.error?.code).toBe('PGRST116');
    expect(none.data).toBeNull();

    const many = await c.from('things').select('*').eq('org_id', 'a').single();
    expect(many.error?.code).toBe('PGRST116');

    const one = await c.from('things').select('id').eq('id', 't1').single();
    expect(one).toMatchObject({ data: { id: 't1' }, error: null });

    const maybeNone = await c.from('things').select('*').eq('id', 'nope').maybeSingle();
    expect(maybeNone).toMatchObject({ data: null, error: null });
    const maybeMany = await c.from('things').select('*').eq('org_id', 'a').maybeSingle();
    expect(maybeMany.error?.code).toBe('PGRST116');
  });

  it('counts exactly with head, and pages with range', async () => {
    const c = db.client();
    const counted = await c.from('things').select('id', { count: 'exact', head: true }).eq('org_id', 'a');
    expect(counted).toMatchObject({ count: 2, data: null });

    const page = await c.from('things').select('id').order('id').range(1, 1);
    expect(page.data).toEqual([{ id: 't2' }]);

    const past = await c.from('things').select('id').order('id').range(10, 20);
    expect(past.error?.code).toBe('PGRST103');
  });

  it('reads an unknown table as empty rather than throwing', async () => {
    expect((await db.client().from('ghosts').select('*')).data).toEqual([]);
  });
});

describe('writes', () => {
  it('insert assigns id/timestamps and returns rows only when select() follows', async () => {
    const c = db.client();
    const silent = await c.from('t').insert({ a: 1 });
    expect(silent.data).toBeNull();
    expect(silent.error).toBeNull();

    const returned = await c.from('t').insert({ a: 2 }).select('id, a').single();
    expect(returned.data).toMatchObject({ a: 2 });
    expect(typeof (returned.data as { id: string }).id).toBe('string');
    expect(db.rows('t')).toHaveLength(2);
    expect(db.rows('t')[0].created_at).toBeTypeOf('string');
  });

  it('reports a unique violation as 23505 and writes nothing', async () => {
    db.unique('orders', ['idempotency_key']);
    const c = db.client();
    await c.from('orders').insert({ idempotency_key: 'k' });
    const dup = await c.from('orders').insert({ idempotency_key: 'k' }).select('id').single();
    expect(dup.error?.code).toBe('23505');
    expect(dup.data).toBeNull();
    expect(db.rows('orders')).toHaveLength(1);
  });

  it('update patches matching rows and maybeSingle is null when nothing matched', async () => {
    db.seed('t', [{ id: '1', v: 'old' }]);
    const c = db.client();
    const hit = await c.from('t').update({ v: 'new' }).eq('id', '1').select('id').maybeSingle();
    expect(hit.data).toEqual({ id: '1' });
    expect(db.rows('t')[0].v).toBe('new');

    const miss = await c.from('t').update({ v: 'x' }).eq('id', 'nope').select('id').maybeSingle();
    expect(miss.data).toBeNull();
    expect(miss.error).toBeNull();
  });

  it('delete removes only what matches', async () => {
    db.seed('t', [{ id: '1' }, { id: '2' }]);
    await db.client().from('t').delete().eq('id', '1');
    expect(db.rows('t').map((r) => r.id)).toEqual(['2']);
  });

  it('upsert merges on the conflict target', async () => {
    db.seed('t', [{ id: '1', org_id: 'a', k: 'x', v: 1, keep: true }]);
    const c = db.client();
    await c.from('t').upsert({ org_id: 'a', k: 'x', v: 2 }, { onConflict: 'org_id,k' });
    await c.from('t').upsert({ org_id: 'a', k: 'y', v: 3 }, { onConflict: 'org_id,k' });
    expect(db.rows('t')).toHaveLength(2);
    expect(db.rows('t')[0]).toMatchObject({ id: '1', v: 2, keep: true });
  });

  it('failNext returns the injected error once, then recovers', async () => {
    db.failNext('t', 'insert', { code: 'XX000', message: 'boom' });
    const c = db.client();
    expect((await c.from('t').insert({})).error?.message).toBe('boom');
    expect((await c.from('t').insert({})).error).toBeNull();
  });
});

describe('embeds and joins', () => {
  beforeEach(() => {
    db.relation('orders', 'order_items', 'order_id');
    db.seed('orders', [
      { id: 'o1', org_id: 'a' },
      { id: 'o2', org_id: 'b' },
    ]);
    db.seed('order_items', [
      { id: 'i1', order_id: 'o1', name: 'lamp' },
      { id: 'i2', order_id: 'o1', name: 'rug' },
      { id: 'i3', order_id: 'o2', name: 'chair' },
    ]);
  });

  it('embeds children and parents', async () => {
    const c = db.client();
    const parent = await c.from('orders').select('*, order_items(*)').eq('id', 'o1').single();
    expect((parent.data as { order_items: unknown[] }).order_items).toHaveLength(2);

    const child = await c.from('order_items').select('id, orders(org_id)').eq('id', 'i3').single();
    expect(child.data).toEqual({ id: 'i3', orders: { org_id: 'b' } });
  });

  it('filters through an inner join on a dotted column', async () => {
    const c = db.client();
    const owned = await c
      .from('order_items')
      .select('id, orders!inner(org_id)')
      .eq('id', 'i1')
      .eq('orders.org_id', 'a')
      .maybeSingle();
    expect(owned.data).toMatchObject({ id: 'i1' });

    const foreign = await c
      .from('order_items')
      .select('id, orders!inner(org_id)')
      .eq('id', 'i1')
      .eq('orders.org_id', 'b')
      .maybeSingle();
    expect(foreign.data).toBeNull();
  });

  it('throws when a select embeds an unregistered relation', async () => {
    await expect(db.client().from('orders').select('*, ghosts(*)')).rejects.toThrow(/no relation/);
  });
});

describe('rpc and storage', () => {
  it('runs registered rpcs and refuses unknown ones loudly', async () => {
    db.rpc('add', ({ a, b }) => (a as number) + (b as number));
    expect((await db.client().rpc('add', { a: 1, b: 2 })).data).toBe(3);
    await expect(db.client().rpc('nope')).rejects.toThrow(/not registered/);
  });

  it('single() on an rpc unwraps a one-row array', async () => {
    db.rpc('facets', () => [{ total: 3 }]);
    expect((await db.client().rpc('facets').single()).data).toEqual({ total: 3 });
  });

  it('stores objects, signs urls for existing ones, and removes', async () => {
    const s = db.client().storage.from('paperwork');
    const up = await s.upload('org/a.pdf', new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    expect(db.bucket('paperwork').get('org/a.pdf')?.bytes).toHaveLength(3);

    const again = await s.upload('org/a.pdf', new Uint8Array([1]));
    expect(again.error?.message).toMatch(/already exists/);

    const signed = await s.createSignedUrl('org/a.pdf', 60, { download: 'coi.pdf' });
    expect(signed.data?.signedUrl).toContain('org/a.pdf');
    expect(db.signedUrls[0]).toMatchObject({ bucket: 'paperwork', expiresIn: 60 });

    const missing = await s.createSignedUrl('org/none.pdf', 60);
    expect(missing.error?.message).toMatch(/not found/);

    await s.remove(['org/a.pdf']);
    expect(db.bucket('paperwork').size).toBe(0);
  });

  it('injects storage failures', async () => {
    db.failNextStorage('upload', 'bucket full');
    const up = await db.client().storage.from('b').upload('p', new Uint8Array([1]));
    expect(up.error?.message).toBe('bucket full');
  });
});
