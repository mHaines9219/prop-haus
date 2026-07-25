'use client';

import { Badge } from '@astryxdesign/core/Badge';
import type { CompatibilityResult } from '@/lib/insurance';

const VARIANT = {
  ok: 'success',
  warning: 'warning',
  gap: 'error',
  'no-policy': 'neutral',
  'not-required': 'neutral',
} as const;

const LABEL: Record<CompatibilityResult['status'], string> = {
  ok: 'Insurance OK',
  warning: 'Warning',
  gap: 'Coverage gap',
  'no-policy': 'Add insurance',
  'not-required': 'No COI needed',
};

export function CoiBadge({ result }: { result: CompatibilityResult }) {
  return <Badge variant={VARIANT[result.status]} label={LABEL[result.status]} />;
}
