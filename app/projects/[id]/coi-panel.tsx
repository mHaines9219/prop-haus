'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { postJson } from '@/lib/api';
import type { CoiStatus, VendorRequest } from '@/lib/projects';
import type { BusinessProfile } from '@/lib/insurance';
import { buildBrokerCertEmail } from '@/lib/insurance';
import { SOURCE_META } from '@/lib/types';
import { VENDOR_COI, ENDORSEMENT_LABEL } from '@/lib/vendor-coi';
import { CoiBadge } from '@/components/coi-badge';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const COI_STATUS: Record<CoiStatus, BadgeVariant> = {
  'not-required': 'neutral',
  gap: 'error',
  needed: 'warning',
  requested: 'warning',
  received: 'success',
  approved: 'success',
};

export function CoiVendorPanel({
  projectId,
  vendor,
  insured,
  productionName,
  startDate,
  endDate,
}: {
  projectId: string;
  vendor: VendorRequest;
  insured?: BusinessProfile;
  productionName: string;
  startDate: string;
  endDate: string;
}) {
  const router = useRouter();
  const [certUrl, setCertUrl] = useState(vendor.coi.certUrl ?? '');
  const req = VENDOR_COI[vendor.vendor];
  const meta = SOURCE_META[vendor.vendor];

  const mutation = useMutation({
    mutationFn: (vars: { status: CoiStatus; certUrl?: string }) =>
      postJson(`/api/projects/${projectId}/coi`, {
        vendor: vendor.vendor,
        status: vars.status,
        certUrl: vars.certUrl,
      }),
    onSuccess: () => router.refresh(),
  });
  const pending = mutation.isPending;

  const setStatus = (status: CoiStatus, extraCertUrl?: string) =>
    mutation.mutate({ status, certUrl: extraCertUrl });

  const mailto = insured?.policy
    ? (() => {
        const e = buildBrokerCertEmail({
          productionName,
          startDate,
          endDate,
          vendorSource: vendor.vendor,
          insured,
        });
        return `mailto:${e.to}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;
      })()
    : null;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Text weight="medium">{meta?.name ?? vendor.vendor}</Text>
            <Text type="supporting" color="secondary">
              requires: GL ${req.generalLiability.perOccurrence.toLocaleString()} / $
              {req.generalLiability.aggregate.toLocaleString()}
              {req.autoLiability && ` · auto $${req.autoLiability.toLocaleString()}`}
              {req.endorsements.length > 0 &&
                ` · ${req.endorsements.map((e) => ENDORSEMENT_LABEL[e]).join(', ')}`}
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <CoiBadge result={vendor.coi.compatibility} />
            <Badge variant={COI_STATUS[vendor.coi.status]} label={vendor.coi.status} />
          </div>
        </div>

        {vendor.coi.compatibility.issues.length > 0 && (
          <Banner
            status="error"
            title="Coverage gaps"
            description="Contact your broker about adding a rider, or talk to the vendor about adjusting requirements."
          >
            <ul className="list-disc pl-5">
              {vendor.coi.compatibility.issues.map((i, idx) => (
                <li key={idx}>
                  <Text as="span" weight="medium">
                    {i.field}:
                  </Text>{' '}
                  <Text as="span">
                    need {i.required}, have {i.actual}
                  </Text>
                </li>
              ))}
            </ul>
          </Banner>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {vendor.coi.status === 'gap' && !insured?.policy && (
            <Link href={`/onboarding/insurance?next=/projects/${projectId}`} isStandalone>
              Add insurance
            </Link>
          )}

          {mailto && vendor.coi.status !== 'received' && vendor.coi.status !== 'approved' && (
            <Link href={mailto} isStandalone>
              ✉ Email broker for cert
            </Link>
          )}

          {vendor.coi.status !== 'requested' &&
            vendor.coi.status !== 'received' &&
            vendor.coi.status !== 'approved' &&
            insured?.policy && (
              <Button
                label="Mark cert requested"
                variant="secondary"
                size="sm"
                isDisabled={pending}
                onClick={() => setStatus('requested')}
              />
            )}

          {(vendor.coi.status === 'requested' || vendor.coi.status === 'needed') && (
            <>
              <div className="min-w-[12rem] flex-1">
                <TextInput
                  label="Certificate URL"
                  isLabelHidden
                  size="sm"
                  placeholder="Paste cert URL"
                  value={certUrl}
                  onChange={(v) => setCertUrl(v)}
                />
              </div>
              <Button
                label="Mark received"
                variant="secondary"
                size="sm"
                isDisabled={pending || !certUrl}
                onClick={() => setStatus('received', certUrl)}
              />
            </>
          )}

          {vendor.coi.status === 'received' && (
            <Button
              label="Vendor approved"
              variant="primary"
              size="sm"
              isDisabled={pending}
              onClick={() => setStatus('approved')}
            />
          )}

          {vendor.coi.certUrl && (
            <Link href={vendor.coi.certUrl} isExternalLink target="_blank" rel="noreferrer">
              view cert
            </Link>
          )}
        </div>

        <Text type="supporting" color="secondary">
          Certificate holder: {req.certificateHolder.name} · {req.certificateHolder.address}
        </Text>
      </div>
    </Card>
  );
}
