/**
 * Reads the sign-in email the local Supabase stack delivered to Mailpit and
 * returns the magic link inside it. Mailpit is part of `supabase start`; its
 * API lives at MAILPIT_URL (default http://127.0.0.1:54324).
 */

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

type SearchResponse = { messages?: Array<{ ID: string }> };
type Message = { Text?: string; HTML?: string };

export async function magicLinkFor(email: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no message yet';

  while (Date.now() < deadline) {
    try {
      const query = encodeURIComponent(`to:"${email}"`);
      const search = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
      if (!search.ok) throw new Error(`mailpit search ${search.status}`);
      const { messages } = (await search.json()) as SearchResponse;
      const id = messages?.[0]?.ID;
      if (id) {
        const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
        if (!res.ok) throw new Error(`mailpit message ${res.status}`);
        const msg = (await res.json()) as Message;
        const body = `${msg.Text ?? ''}\n${msg.HTML ?? ''}`.replace(/&amp;/g, '&');
        const link = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/);
        if (link) return link[0];
        lastError = 'message found but it has no verify link';
      }
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`No magic link for ${email} within ${timeoutMs}ms (${lastError}). Is Mailpit at ${MAILPIT}?`);
}
