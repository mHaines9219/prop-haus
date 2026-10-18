'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { PlanTier } from './accounts';
import { getJson } from './api';
import { PLAN_ENTITLEMENTS, type Entitlements } from './plans';

/**
 * The caller's plan, as the client sees it.
 *
 * Catalog pages are public and cached (the item page is ISR, category and
 * search render for everyone alike), so the server cannot print a different
 * card per tier. Instead one request to /api/me answers for the whole page:
 * every card and credit line reads this context and prints the vendor or
 * withholds it. The server keeps enforcing the metered gates (AI search,
 * paperwork); this is the presentation side of the same plan.
 *
 * The default, with no provider mounted, is the FREE view: a component that
 * forgot the provider withholds rather than reveals.
 */
export type PlanView = {
  /** 'loading' until /api/me answers; render nothing tier-specific meanwhile. */
  status: 'loading' | 'ready';
  signedIn: boolean;
  plan: PlanTier;
  actualPlan: PlanTier;
  isAdmin: boolean;
};

type BooleanFeature = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

export const FREE_VIEW: PlanView = {
  status: 'ready',
  signedIn: false,
  plan: 'free',
  actualPlan: 'free',
  isAdmin: false,
};

export const PlanContext = createContext<PlanView>(FREE_VIEW);

type Me = Omit<PlanView, 'status'>;

export function PlanProvider({ children }: { children: ReactNode }) {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => getJson<Me>('/api/me'),
    staleTime: 5 * 60_000,
  });
  const value: PlanView = me.data
    ? { status: 'ready', ...me.data }
    : me.isError
      ? FREE_VIEW
      : { ...FREE_VIEW, status: 'loading' };
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlanView(): PlanView {
  return useContext(PlanContext);
}

/** true/false once the plan is known; null while /api/me is still in flight. */
export function useEntitled(feature: BooleanFeature): boolean | null {
  const view = usePlanView();
  if (view.status === 'loading') return null;
  return PLAN_ENTITLEMENTS[view.plan][feature];
}
