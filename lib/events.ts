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
  'project_created',
  'project_submitted',
  'paywall_hit', // strongest upgrade signal; payload: { feature, metric? }
  'document_uploaded', // payload: { kind, vendor? }
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
 */
export async function logEvent(
  client: { from: (t: string) => { insert: (rows: unknown) => Promise<{ error: unknown }> } },
  input: LogEventInput,
): Promise<void> {
  await client.from('events').insert({
    org_id: input.orgId ?? null,
    user_id: input.userId ?? null,
    type: input.type,
    payload: input.payload ?? {},
  });
}
