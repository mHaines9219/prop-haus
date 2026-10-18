import type { ReactElement } from 'react';
import type { PlanTier } from '@/lib/accounts';
import { FREE_VIEW, PlanContext, type PlanView } from '@/lib/plan-view';
import type { Allowance } from '@/lib/usage';

/** A fixed plan view for a component test: `render(withPlan(<ItemCard … />, 'pro'))`. */
export function planView(plan: PlanTier, over: Partial<PlanView> = {}): PlanView {
  return { ...FREE_VIEW, signedIn: true, plan, actualPlan: plan, ...over };
}

export function withPlan(ui: ReactElement, plan: PlanTier | PlanView): ReactElement {
  const value = typeof plan === 'string' ? planView(plan) : plan;
  return <PlanContext.Provider value={value}>{ui}</PlanContext.Provider>;
}

/** An AI search allowance for a plan view: `planView('free', { aiSearches: aiAllowance({ remaining: 0, allowed: false }) })`. */
export function aiAllowance(over: Partial<Allowance> = {}): Allowance {
  return { metric: 'aiSearches', period: '2026-W42', window: 'week', used: 0, limit: 3, remaining: 3, allowed: true, ...over };
}
