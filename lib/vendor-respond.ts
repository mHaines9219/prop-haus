/**
 * What a vendor reply link does when opened (FUT-5, first cut). Server only.
 *
 * The token is the whole credential: there is no session. Verification is in
 * lib/vendor-links.ts; this module checks the claims against the order row,
 * writes the line status once, and records one event per change. Opening the
 * same link twice writes nothing the second time, and the latest click wins
 * when the vendor flips their answer.
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
  claimsFor,
  vendorActionUrl,
  verifyVendorAction,
  type VendorAction,
} from './vendor-links';

export type RespondResult =
  | {
      ok: true;
      vendorName: string;
      itemName: string;
      action: VendorAction;
      status: ItemStatus;
      /** False when the line already carried this status. */
      changed: boolean;
      /** The other answer, signed for the same line, so a wrong click is one more click. */
      flip: { action: VendorAction; url: string };
    }
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

export async function respondToVendorLink(token: string, now = Date.now()): Promise<RespondResult> {
  const verified = verifyVendorAction(token, now);
  if (!verified.ok) return verified;
  const { claims } = verified;

  const { data, error } = await createAdminClient()
    .from('order_items')
    .select('id, order_id, source, vendor, name, status, orders!inner(org_id)')
    .eq('id', claims.itemId)
    .maybeSingle();
  if (error) throw error;

  const line = data as unknown as LineRow | null;
  // The claims name an order and a vendor; a line that belongs to either
  // another order or another house is not this link's to change.
  if (!line?.orders || line.order_id !== claims.orderId || line.source !== claims.vendorId) {
    return { ok: false, reason: 'not_found' };
  }

  const orgId = line.orders.org_id;
  const status = STATUS_FOR_ACTION[claims.action];
  const changed = line.status !== status;
  if (changed) {
    await setItemStatus(claims.itemId, orgId, status);
    await recordEvents({
      orgId,
      type: 'vendor_replied',
      payload: { orderId: claims.orderId, orderItemId: claims.itemId, vendorId: claims.vendorId, action: claims.action, status },
    });
  }

  const flipAction: VendorAction = claims.action === 'available' ? 'unavailable' : 'available';
  return {
    ok: true,
    vendorName: VENDORS[claims.vendorId as Source]?.name ?? line.vendor,
    itemName: line.name,
    action: claims.action,
    status,
    changed,
    flip: {
      action: flipAction,
      url: vendorActionUrl(claimsFor({ id: claims.orderId }, { id: claims.itemId, source: claims.vendorId }, flipAction, now)),
    },
  };
}
