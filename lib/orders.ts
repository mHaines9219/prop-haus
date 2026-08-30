import type { Source } from './types';
import { createAdminClient } from './supabase/admin';

export type OrderStatus = 'placed' | 'processing' | 'confirmed' | 'cancelled';

export type OrderItem = {
  id: string;
  itemId: string;
  source: Source;
  sourceId: string;
  name: string;
  image?: string;
  sourceUrl: string;
  vendor: string;
  priceCents?: number;
};

export type Order = {
  id: string;
  orgId: string;
  status: OrderStatus;
  rentalStart?: string;
  rentalEnd?: string;
  deliveryNotes?: string;
  totalCents?: number;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
};

export type CheckoutProfile = {
  productionName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  defaultRentalWindowDays?: number;
};

export type CartLineInput = {
  itemId: string;
  source: string;
  sourceId: string;
  name: string;
  image?: string;
  sourceUrl: string;
  vendor: string;
  priceCents?: number;
};

export type CreateOrderInput = {
  orgId: string;
  lines: CartLineInput[];
  rentalStart?: string;
  rentalEnd?: string;
  deliveryNotes?: string;
  idempotencyKey: string;
};

// ---- public API ----

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const db = createAdminClient();

  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      org_id: input.orgId,
      status: 'placed',
      rental_start: input.rentalStart ?? null,
      rental_end: input.rentalEnd ?? null,
      delivery_notes: input.deliveryNotes ?? null,
      idempotency_key: input.idempotencyKey,
    })
    .select('id')
    .single();

  if (orderError) {
    // Idempotency: duplicate key → return the already-placed order.
    if (orderError.code === '23505') {
      return getOrderByIdempotencyKey(input.idempotencyKey, input.orgId);
    }
    throw orderError;
  }

  if (input.lines.length > 0) {
    const { error: itemsError } = await db.from('order_items').insert(
      input.lines.map((l) => ({
        order_id: order.id,
        item_id: l.itemId,
        source: l.source,
        source_id: l.sourceId,
        name: l.name,
        image: l.image ?? null,
        source_url: l.sourceUrl,
        vendor: l.vendor,
        price_cents: l.priceCents ?? null,
      })),
    );
    if (itemsError) throw itemsError;
  }

  return getOrderById(order.id, input.orgId);
}

export async function getOrderById(id: string, orgId: string): Promise<Order> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (error || !data) throw error ?? new Error('Order not found');
  return toOrder(data as OrderRow);
}

export async function listOrders(orgId: string): Promise<Order[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('orders')
    .select('*, order_items(*)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((r) => toOrder(r as OrderRow));
}

export async function getCheckoutProfile(orgId: string): Promise<CheckoutProfile> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('organizations')
    .select('checkout_profile')
    .eq('id', orgId)
    .single();

  if (error || !data) return {};
  return ((data as { checkout_profile: CheckoutProfile }).checkout_profile) ?? {};
}

export async function updateCheckoutProfile(orgId: string, profile: CheckoutProfile): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from('organizations')
    .update({ checkout_profile: profile })
    .eq('id', orgId);

  if (error) throw error;
}

// ---- internal ----

async function getOrderByIdempotencyKey(key: string, orgId: string): Promise<Order> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('orders')
    .select('*, order_items(*)')
    .eq('idempotency_key', key)
    .eq('org_id', orgId)
    .single();

  if (error || !data) throw error ?? new Error('Order not found');
  return toOrder(data as OrderRow);
}

type OrderItemRow = {
  id: string;
  item_id: string;
  source: string;
  source_id: string;
  name: string;
  image: string | null;
  source_url: string;
  vendor: string;
  price_cents: number | null;
};

type OrderRow = {
  id: string;
  org_id: string;
  status: string;
  rental_start: string | null;
  rental_end: string | null;
  delivery_notes: string | null;
  total_cents: number | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItemRow[] | null;
};

function toOrderItem(r: OrderItemRow): OrderItem {
  return {
    id: r.id,
    itemId: r.item_id,
    source: r.source as Source,
    sourceId: r.source_id,
    name: r.name,
    ...(r.image ? { image: r.image } : {}),
    sourceUrl: r.source_url,
    vendor: r.vendor,
    ...(r.price_cents !== null ? { priceCents: r.price_cents } : {}),
  };
}

function toOrder(r: OrderRow): Order {
  return {
    id: r.id,
    orgId: r.org_id,
    status: r.status as OrderStatus,
    ...(r.rental_start ? { rentalStart: r.rental_start } : {}),
    ...(r.rental_end ? { rentalEnd: r.rental_end } : {}),
    ...(r.delivery_notes ? { deliveryNotes: r.delivery_notes } : {}),
    ...(r.total_cents !== null ? { totalCents: r.total_cents } : {}),
    items: (r.order_items ?? []).map(toOrderItem),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
