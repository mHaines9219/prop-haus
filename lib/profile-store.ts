'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BusinessProfile, InsurancePolicy } from './insurance';

type ProfileState = {
  profile: BusinessProfile | null;
  setProfile: (p: BusinessProfile) => void;
  setPolicy: (p: InsurancePolicy) => void;
  clear: () => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      setPolicy: (policy) => {
        const cur = get().profile;
        if (!cur) return;
        set({ profile: { ...cur, policy } });
      },
      clear: () => set({ profile: null }),
    }),
    { name: 'prop-haus-profile' },
  ),
);
