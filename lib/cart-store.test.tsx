import { beforeEach, describe, expect, it } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';
import { useCart, type CartLine } from './cart-store';

/**
 * The cart is the one piece of client state that survives a reload. Runs in
 * jsdom so the persist middleware has a real localStorage to write to.
 */

const KEY = 'prop-haus-cart';

function line(id: string, over: Partial<CartLine['item']> = {}): CartLine['item'] {
  const it = makePropItem({ id });
  return {
    id: it.id,
    source: it.source,
    sourceId: it.sourceId,
    name: it.name,
    images: it.images,
    sourceUrl: it.sourceUrl,
    category: it.category,
    ...over,
  };
}

function stored(): CartLine[] {
  const raw = window.localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { state: { lines: CartLine[] } }).state.lines : [];
}

beforeEach(() => {
  useCart.setState({ lines: [] });
});

describe('useCart', () => {
  it('starts empty', () => {
    expect(useCart.getState().lines).toEqual([]);
  });

  it('adds items in order', () => {
    useCart.getState().add(line('a'));
    useCart.getState().add(line('b'));
    expect(useCart.getState().lines.map((l) => l.item.id)).toEqual(['a', 'b']);
  });

  it('ignores a second add of the same id and keeps the first snapshot', () => {
    useCart.getState().add(line('a', { name: 'first' }));
    const before = useCart.getState();
    useCart.getState().add(line('a', { name: 'second' }));
    expect(useCart.getState().lines).toHaveLength(1);
    expect(useCart.getState().lines[0].item.name).toBe('first');
    expect(useCart.getState()).toBe(before);
  });

  it('removes by id and ignores an unknown id', () => {
    useCart.getState().add(line('a'));
    useCart.getState().add(line('b'));
    useCart.getState().remove('a');
    expect(useCart.getState().lines.map((l) => l.item.id)).toEqual(['b']);
    useCart.getState().remove('zzz');
    expect(useCart.getState().lines.map((l) => l.item.id)).toEqual(['b']);
  });

  it('clears everything', () => {
    useCart.getState().add(line('a'));
    useCart.getState().clear();
    expect(useCart.getState().lines).toEqual([]);
  });

  it('persists under the prop-haus-cart key', () => {
    expect(useCart.persist.getOptions().name).toBe(KEY);
    useCart.getState().add(line('a'));
    expect(stored().map((l) => l.item.id)).toEqual(['a']);
    useCart.getState().clear();
    expect(stored()).toEqual([]);
  });

  it('stores only the snapshot fields, never functions', () => {
    useCart.getState().add(line('a'));
    const raw = JSON.parse(window.localStorage.getItem(KEY)!) as { state: Record<string, unknown> };
    expect(Object.keys(raw.state)).toEqual(['lines']);
    expect(Object.keys(stored()[0].item).sort()).toEqual(['category', 'id', 'images', 'name', 'source', 'sourceId', 'sourceUrl']);
  });

  it('rehydrates from storage', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ state: { lines: [{ item: line('saved') }] }, version: 0 }));
    await useCart.persist.rehydrate();
    expect(useCart.getState().lines.map((l) => l.item.id)).toEqual(['saved']);
  });
});
