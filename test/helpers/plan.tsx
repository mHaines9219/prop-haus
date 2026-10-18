import type { ReactElement } from 'react';
import type { PlanTier } from '@/lib/accounts';
import { FREE_VIEW, PlanContext, type PlanView } from '@/lib/plan-view';

/** A fixed plan view for a component test: `render(withPlan(<ItemCard … />, 'pro'))`. */
export function planView(plan: PlanTier, over: Partial<PlanView> = {}): PlanView {
  return { ...FREE_VIEW, signedIn: true, plan, actualPlan: plan, ...over };
}

export function withPlan(ui: ReactElement, plan: PlanTier | PlanView): ReactElement {
  const value = typeof plan === 'string' ? planView(plan) : plan;
  return <PlanContext.Provider value={value}>{ui}</PlanContext.Provider>;
}
