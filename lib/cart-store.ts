'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PropItem } from './types';

export type CartLine = {
  item: Pick<PropItem, 'id' | 'source' | 'sourceId' | 'name' | 'images' | 'sourceUrl' | 'category'>;
  qty: number;
};

type CartState = {
  lines: CartLine[];
  startDate: string | null;
  endDate: string | null;
  add: (item: CartLine['item']) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  setDates: (start: string | null, end: string | null) => void;
  clear: () => void;
  count: () => number;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      startDate: null,
      endDate: null,
      add: (item) =>
        set((s) => {
          const existing = s.lines.find((l) => l.item.id === item.id);
          if (existing) {
            return {
              lines: s.lines.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l)),
            };
          }
          return { lines: [...s.lines, { item, qty: 1 }] };
        }),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.item.id !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
          lines: s.lines
            .map((l) => (l.item.id === id ? { ...l, qty: Math.max(1, qty) } : l))
            .filter((l) => l.qty > 0),
        })),
      setDates: (startDate, endDate) => set({ startDate, endDate }),
      clear: () => set({ lines: [], startDate: null, endDate: null }),
      count: () => get().lines.reduce((n, l) => n + l.qty, 0),
    }),
    { name: 'prop-haus-cart' },
  ),
);
