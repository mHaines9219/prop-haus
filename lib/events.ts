/**
 * Append-only event log — the highest-value data we collect from free users
 * (search intent, demand gaps, and upgrade signals).
 *
 * Events are SERVER-WRITTEN ONLY (service role): client-forged analytics are
 * worthless and a free-tier abuse vector. RLS lets org members read their own
 * org's events; nothing but the service role inserts.
 *
 * This is an event STREAM, not entity columns — adding a new event type never
 * requires a migration, just a new string + payload shape.
 */
export const EVENT_TYPES = [
  'signup',
  'onboarding_completed',
  'search', // payload: { mode, query, resultCount }
  'vision_search', // metered trial action; payload: { mode }
  'zero_result_search', // demand/inventory gap; payload: { query }
  'cart_add', // payload: { itemId, vendor }
  'cart_abandoned',
  'outbound_click', // vendor click-out won; payload: { itemId, source, surface }
  'project_created',
  'project_submitted',
  'paywall_hit', // strongest upgrade signal; payload: { feature, metric? }
  'document_uploaded', // payload: { kind, vendor? }
  'order_placed', // payload: { orderId, itemCount, vendorCount }
  'order_status_changed', // payload: { orderId, status }
  'item_status_changed', // payload: { orderId, orderItemId, status }
  'crew_requested', // payload: { crewRequestId, contractorId }
  'crew_status_changed', // payload: { crewRequestId, status }
  'outreach_sent', // payload: { orderId, messageId, vendorId }
  'outreach_failed', // payload: { orderId, messageId, vendorId, error }
  'document_filled', // payload: { orderId, documentId, vendorId, kind, status, missing }
  'document_signed', // payload: { orderId, documentId, vendorId, kind }
  'document_failed', // payload: { orderId, documentId, vendorId, kind, error }
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type AppEvent = {
  id: string;
  orgId: string | null;
  userId: string | null; // null for system-generated events
  type: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type LogEventInput = {
  orgId?: string | null;
  userId?: string | null;
  type: EventType;
  payload?: Record<string, unknown>;
};

/**
 * Insert an event. Pass a SERVICE-ROLE Supabase client (see lib/supabase/admin.ts)
 * so the write bypasses RLS and can't be forged from the browser. Decoupled from
 * the client module so this file has no env dependency.
 *
 * THROWS on a rejected insert. Supabase reports failures in the returned `error`
 * rather than by rejecting, so discarding it would drop events silently — the
 * failure mode we would never notice. Callers that must not fail should use
 * `recordEvents` in `lib/analytics.ts`, which catches for exactly this reason.
 */
/** The exact row shape written to `public.events`. */
type EventRow = {
  org_id: string | null;
  user_id: string | null;
  type: EventType;
  payload: Record<string, unknown>;
};

/**
 * Structural stand-in for a Supabase client, kept minimal so this module has no
 * dependency on `@supabase/supabase-js`. `insert` takes a concrete `EventRow`
 * rather than `unknown` — a parameter of type `unknown` is contravariantly
 * incompatible with the real client's signature, so the previous shape could
 * not actually be satisfied by `createAdminClient()`. `PromiseLike` because
 * PostgREST returns a thenable builder, not a Promise.
 */
export type EventSink = {
  from: (table: string) => { insert: (rows: EventRow) => PromiseLike<{ error: unknown }> };
};

export async function logEvent(client: EventSink, input: LogEventInput): Promise<void> {
  const { error } = await client.from('events').insert({
    org_id: input.orgId ?? null,
    user_id: input.userId ?? null,
    type: input.type,
    payload: input.payload ?? {},
  });
  if (error) {
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    throw new Error(`events insert failed for "${input.type}": ${message}`);
  }
}
