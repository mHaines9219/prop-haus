'use server';

import { createClient } from '@/lib/supabase/server';
import { currentOrgId } from '@/lib/session';
import type { InsuranceProfile } from '@/lib/insurance/minimums';

export async function saveInsuranceProfile(
  orgId: string,
  profile: InsuranceProfile
): Promise<{ error?: string }> {
  const callerOrgId = await currentOrgId();
  if (!callerOrgId || callerOrgId !== orgId) {
    return { error: 'Not authorized' };
  }

  if (!profile.namedInsured?.trim()) {
    return { error: 'Named insured is required' };
  }

  if (!profile.glLimit || profile.glLimit < 0) {
    return { error: 'GL limit must be a positive number' };
  }

  if (!profile.aggregateLimit || profile.aggregateLimit < profile.glLimit) {
    return { error: 'Aggregate limit must be at least as large as the GL limit' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('organizations')
    .update({ insurance_profile: profile, updated_at: new Date().toISOString() })
    .eq('id', orgId);

  if (error) {
    console.error('[insurance] save error', error);
    return { error: 'Failed to save. Try again.' };
  }

  return {};
}
