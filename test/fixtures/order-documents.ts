import { ORG_ID } from '@/test/mocks/session';

/** An order_documents row for FakeSupabase seeds: a filled rental agreement on order-1. */
export function orderDocumentRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    org_id: ORG_ID,
    order_id: 'order-1',
    vendor_id: 'omega',
    vendor_form_id: 'form-1',
    kind: 'rental_agreement',
    label: 'Rental agreement',
    status: 'filled',
    storage_path: `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.pdf`,
    signed_storage_path: null,
    anvil_packet_eid: null,
    anvil_document_group_eid: null,
    sign_url: null,
    error: null,
    created_at: '2026-09-02T10:00:00.000Z',
    updated_at: '2026-09-02T10:00:00.000Z',
    ...over,
  };
}
