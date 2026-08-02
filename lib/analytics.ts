import { createAdminClient } from './supabase/admin';
import { logEvent, type LogEventInput } from './events';

/**
 * Record events without ever failing the request that produced them.
 *
 * Analytics is not worth a 502. Every failure mode here — no service-role key
 * in local dev, an unreachable database, a rejected insert — is caught and
 * logged, never propagated. Callers do not need a try/catch.
 *
 * This is the only entry point route handlers should use. `logEvent` in
 * `events.ts` stays env-free and now surfaces insert errors, so the decision to
 * swallow them lives in exactly one place: here.
 */
export async function recordEvents(...inputs: LogEventInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    const client = createAdminClient();
    await Promise.all(inputs.map((input) => logEvent(client, input)));
  } catch (err) {
    const types = inputs.map((i) => i.type).join(', ');
    console.warn(`[events] not recorded (${types}): ${(err as Error).message}`);
  }
}
