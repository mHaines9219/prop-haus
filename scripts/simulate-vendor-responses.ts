/**
 * simulate-vendor-responses.ts — demo driver for the /jobs dashboard.
 *
 *   pnpm simulate:vendor
 *
 * PLACEHOLDER: replaced by real vendor coordination. There is no vendor portal
 * or vendor API yet, so nothing ever moves an order off `placed`. This script
 * stands in for that missing integration so the whole flow is demoable with zero
 * secrets: it walks the most recent order's line items forward
 * (pending -> quoted -> confirmed), marks one line unavailable, advances the
 * order status, confirms the latest crew request, and logs the same events the
 * real transition route would. Re-run it after placing a new order.
 *
 * When real vendor coordination lands, delete this script and its pnpm alias —
 * the events and status transitions it writes go through lib/orders.ts, which is
 * the seam the real integration will call instead.
 */

import { createAdminClient } from '../lib/supabase/admin';
import { getOrderById, setItemStatus, setOrderStatus } from '../lib/orders';
import { recordEvents } from '../lib/analytics';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const db = createAdminClient();

  // Latest placed/processing order — the one a demo just created.
  const { data: latest, error } = await db
    .from('orders')
    .select('id, org_id, status')
    .in('status', ['placed', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!latest) {
    console.log('No in-flight order to simulate. Place an order first, then re-run.');
    return;
  }

  const { id: orderId, org_id: orgId } = latest as { id: string; org_id: string; status: string };
  const order = await getOrderById(orderId, orgId);

  if (order.items.length === 0) {
    console.log(`Order ${orderId.slice(0, 8)} has no items.`);
    return;
  }

  console.log(`Simulating vendor responses for order ${orderId.slice(0, 8)} (${order.items.length} items)...`);

  // Order moves to processing as soon as a vendor engages.
  await setOrderStatus(orderId, orgId, 'processing');
  await recordEvents({
    orgId,
    userId: null,
    type: 'order_status_changed',
    payload: { orderId, status: 'processing' },
  });

  // Walk each line forward. The last item goes unavailable to exercise that path.
  const lastIndex = order.items.length - 1;
  for (let i = 0; i < order.items.length; i += 1) {
    const item = order.items[i]!;
    const unavailable = i === lastIndex && order.items.length > 1;

    await sleep(600);
    if (unavailable) {
      await setItemStatus(item.id, orgId, 'unavailable', {
        note: 'Out on another production for these dates.',
      });
      await recordEvents({
        orgId,
        userId: null,
        type: 'item_status_changed',
        payload: { orderId, orderItemId: item.id, status: 'unavailable' },
      });
      console.log(`  ${item.name} -> unavailable`);
      continue;
    }

    // A quote comes back first (carry a price), then confirmation.
    const quotedCents = item.priceCents ?? 15000;
    await setItemStatus(item.id, orgId, 'quoted', { quotedCents });
    await recordEvents({
      orgId,
      userId: null,
      type: 'item_status_changed',
      payload: { orderId, orderItemId: item.id, status: 'quoted' },
    });
    console.log(`  ${item.name} -> quoted ($${(quotedCents / 100).toFixed(0)})`);

    await sleep(600);
    await setItemStatus(item.id, orgId, 'confirmed');
    await recordEvents({
      orgId,
      userId: null,
      type: 'item_status_changed',
      payload: { orderId, orderItemId: item.id, status: 'confirmed' },
    });
    console.log(`  ${item.name} -> confirmed`);
  }

  // Order-level confirmation once the quoted/confirmed lines have settled.
  await setOrderStatus(orderId, orgId, 'confirmed');
  await recordEvents({
    orgId,
    userId: null,
    type: 'order_status_changed',
    payload: { orderId, status: 'confirmed' },
  });

  // Confirm the org's latest crew request too, so the crew section moves.
  const { data: crew } = await db
    .from('crew_requests')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('status', 'requested')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (crew) {
    const crewRow = crew as { id: string };
    await db
      .from('crew_requests')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', crewRow.id);
    await recordEvents({
      orgId,
      userId: null,
      type: 'crew_status_changed',
      payload: { crewRequestId: crewRow.id, status: 'confirmed' },
    });
    console.log(`  crew request ${crewRow.id.slice(0, 8)} -> confirmed`);
  }

  console.log('Done. Refresh /jobs to see the order settle.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
