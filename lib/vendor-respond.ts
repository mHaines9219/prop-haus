/**
 * What a vendor reply link does when opened (FUT-5, first cut). Server only.
 *
 * The token is the whole credential: there is no session. Verification is in
 * lib/vendor-links.ts. `readVendorLink` checks the claims against the order
 * row and writes nothing, so the page a mail scanner fetches is harmless.
 * `respondToVendorLink` is the POST behind the page's one button: it writes
 * the line status once and records one event per change. The same answer
 * twice writes nothing the second time, and the latest answer wins when the
 * vendor flips.
 *
 * A booking stage (lib/booking/machine.ts) is never touched from here: a
 * vendor's answer sets the line status and nothing else.
 */

import { createAdminClient } from './supabase/admin';
import { setItemStatus, type ItemStatus } from './orders';
import { recordEvents } from './analytics';
import { VENDORS } from './vendors';
import type { Source } from './types';
import {
  STATUS_FOR_ACTION,
  vendorActionUrl,
  verifyVendorAction,
  type VendorAction,
  type VendorActionClaims,
} from './vendor-links';

export type VendorLine = {
  vendorName: string;
  itemName: string;
  /** What the line reads today. */
  status: ItemStatus;
  /** What this link's answer sets it to. */
  action: VendorAction;
  /** The other answer, signed for the same line with the same expiry. */
  flip: { action: VendorAction; url: string };
};

export type ReadResult =
  | { ok: true; line: VendorLine; claims: VendorActionClaims; orgId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_found' };

export type RespondResult =
  | { ok: true; line: VendorLine; changed: boolean }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_found' };

type LineRow = {
  id: string;
  order_id: string;
  source: string;
  vendor: string;
  name: string;
  status: string;
  orders: { org_id: string } | null;
};

/** Verify the token and find its line. Writes nothing. */
export async function readVendorLink(token: string, now = Date.now()): Promise<ReadResult> {
  const verified = verifyVendorAction(token, now);
  if (!verified.ok) return verified;
  const { claims } = verified;

  const { data, error } = await createAdminClient()
    .from('order_items')
    .select('id, order_id, source, vendor, name, status, orders!inner(org_id)')
    .eq('id', claims.itemId)
    .maybeSingle();
  if (error) throw error;

  const row = data as unknown as LineRow | null;
  // The claims name an order and a vendor; a line that belongs to either
  // another order or another house is not this link's to change.
  if (!row?.orders || row.order_id !== claims.orderId || row.source !== claims.vendorId) {
    return { ok: false, reason: 'not_found' };
  }

  const flipAction: VendorAction = claims.action === 'available' ? 'unavailable' : 'available';
  return {
    ok: true,
    claims,
    orgId: row.orders.org_id,
    line: {
      vendorName: VENDORS[claims.vendorId as Source]?.name ?? row.vendor,
      itemName: row.name,
      status: row.status as ItemStatus,
      action: claims.action,
      flip: { action: flipAction, url: vendorActionUrl({ ...claims, action: flipAction }) },
    },
  };
}

/** Apply the token's answer to its line. */
export async function respondToVendorLink(token: string, now = Date.now()): Promise<RespondResult> {
  const read = await readVendorLink(token, now);
  if (!read.ok) return read;
  const { claims, orgId, line } = read;

  const status = STATUS_FOR_ACTION[claims.action];
  const changed = line.status !== status;
  if (changed) {
    await setItemStatus(claims.itemId, orgId, status, { orderId: claims.orderId });
    await recordEvents({
      orgId,
      type: 'vendor_replied',
      payload: { orderId: claims.orderId, orderItemId: claims.itemId, vendorId: claims.vendorId, action: claims.action, status },
    });
  }
  return { ok: true, line: { ...line, status }, changed };
}
