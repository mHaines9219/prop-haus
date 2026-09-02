import type { CartLineInput, Order, OrderItem } from '@/lib/orders';
import type { OrderProfile } from '@/lib/order-profile';
import { ORG_ID } from '@/test/mocks/session';

export function makeCartLine(over: Partial<CartLineInput> = {}): CartLineInput {
  return {
    itemId: 'omega-12345',
    source: 'omega',
    sourceId: '12345',
    name: 'Mid-century walnut credenza',
    image: 'https://omegacinemaprops.com/img/12345.jpg',
    sourceUrl: 'https://omegacinemaprops.com/item/12345',
    vendor: 'Omega Cinema Props',
    priceCents: 12000,
    ...over,
  };
}

export function makeOrderItem(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'oi-1',
    itemId: 'omega-12345',
    source: 'omega',
    sourceId: '12345',
    name: 'Mid-century walnut credenza',
    image: 'https://omegacinemaprops.com/img/12345.jpg',
    sourceUrl: 'https://omegacinemaprops.com/item/12345',
    vendor: 'Omega Cinema Props',
    priceCents: 12000,
    status: 'pending',
    ...over,
  };
}

export function makeOrder(over: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orgId: ORG_ID,
    status: 'placed',
    rentalStart: '2026-09-07',
    rentalEnd: '2026-09-14',
    deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
    items: [makeOrderItem()],
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...over,
  };
}

/** Row shapes for FakeSupabase seeds (orders + order_items with a relation). */
export function orderRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'order-1',
    org_id: ORG_ID,
    status: 'placed',
    rental_start: '2026-09-07',
    rental_end: '2026-09-14',
    delivery_address: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
    delivery_notes: null,
    total_cents: null,
    idempotency_key: 'idem-1',
    created_at: '2026-09-02T10:00:00.000Z',
    updated_at: '2026-09-02T10:00:00.000Z',
    ...over,
  };
}

export function orderItemRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'oi-1',
    order_id: 'order-1',
    item_id: 'omega-12345',
    source: 'omega',
    source_id: '12345',
    name: 'Mid-century walnut credenza',
    image: 'https://omegacinemaprops.com/img/12345.jpg',
    source_url: 'https://omegacinemaprops.com/item/12345',
    vendor: 'Omega Cinema Props',
    price_cents: 12000,
    status: 'pending',
    status_note: null,
    quoted_cents: null,
    ...over,
  };
}

/** A profile that passes orderReadiness. */
export const READY_PROFILE: OrderProfile = {
  company: { legalName: 'Nocturne Pictures LLC' },
  contacts: { ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example' } },
  defaults: {
    rentalWindowDays: 7,
    deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
  },
  insurance: {},
  authorization: { formsOnBehalf: true, acceptedAt: '2026-09-02T10:00:00Z' },
};
