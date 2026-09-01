import type { Source } from './types';
import { createAdminClient } from './supabase/admin';

export type OrderStatus = 'placed' | 'processing' | 'confirmed' | 'cancelled';

/**
 * Per-line vendor coordination state. Matches DESIGN.md §9.10's canonical
 * StatusToken states and the CHECK constraint on order_items.status.
 */
export type ItemStatus = 'pending' | 'quoted' | 'confirmed' | 'unavailable';

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
  status: ItemStatus;
  statusNote?: string;
  quotedCents?: number;
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

/**
 * Move an order to a new lifecycle status. Service-role; org-scoped so a caller
 * can only touch its own orders. Returns nothing — throws if the order is not
 * found under this org.
 */
export async function setOrderStatus(
  orderId: string,
  orgId: string,
  status: OrderStatus,
): Promise<void> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Order not found');
}

/**
 * Move a single line item to a new coordination status. Verifies the item's
 * parent order belongs to `orgId` before writing (a caller must not be able to
 * flip another org's line by guessing an id). `note`/`quotedCents` are only
 * written when explicitly provided.
 */
export async function setItemStatus(
  orderItemId: string,
  orgId: string,
  status: ItemStatus,
  opts?: { note?: string | null; quotedCents?: number | null },
): Promise<void> {
  const db = createAdminClient();

  const { data: owned, error: checkError } = await db
    .from('order_items')
    .select('id, orders!inner(org_id)')
    .eq('id', orderItemId)
    .eq('orders.org_id', orgId)
    .maybeSingle();

  if (checkError) throw checkError;
  if (!owned) throw new Error('Order item not found');

  const patch: Record<string, unknown> = { status };
  if (opts && 'note' in opts) patch.status_note = opts.note ?? null;
  if (opts && 'quotedCents' in opts) patch.quoted_cents = opts.quotedCents ?? null;

  const { error } = await db.from('order_items').update(patch).eq('id', orderItemId);
  if (error) throw error;
}

export type VendorSummary = {
  vendor: string;
  total: number;
  pending: number;
  quoted: number;
  confirmed: number;
  unavailable: number;
};

/**
 * Per-vendor line-item counts for an order — the data behind the §9.7 row copy
 * ("Newel confirmed 4 of 6 items. 2 pending."). Derived, never stored.
 */
export function summarizeOrder(order: Order): VendorSummary[] {
  const byVendor = new Map<string, VendorSummary>();
  for (const item of order.items) {
    let s = byVendor.get(item.vendor);
    if (!s) {
      s = { vendor: item.vendor, total: 0, pending: 0, quoted: 0, confirmed: 0, unavailable: 0 };
      byVendor.set(item.vendor, s);
    }
    s.total += 1;
    s[item.status] += 1;
  }
  return [...byVendor.values()].sort((a, b) => a.vendor.localeCompare(b.vendor));
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
  status: string;
  status_note: string | null;
  quoted_cents: number | null;
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
    status: (r.status as ItemStatus) ?? 'pending',
    ...(r.status_note ? { statusNote: r.status_note } : {}),
    ...(r.quoted_cents !== null ? { quotedCents: r.quoted_cents } : {}),
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
