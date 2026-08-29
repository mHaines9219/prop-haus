'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PropItem } from './types';

export type CartLine = {
  item: Pick<PropItem, 'id' | 'source' | 'sourceId' | 'name' | 'images' | 'sourceUrl' | 'category'>;
};

type CartState = {
  lines: CartLine[];
  add: (item: CartLine['item']) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (item) =>
        set((s) => {
          if (s.lines.some((l) => l.item.id === item.id)) return s;
          return { lines: [...s.lines, { item }] };
        }),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.item.id !== id) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'prop-haus-cart' },
  ),
);
