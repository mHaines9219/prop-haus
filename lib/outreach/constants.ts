/**
 * Outreach constants a client component may import. lib/outreach/send.ts and
 * lib/vendor-links.ts are server-only (node:crypto, the admin client), so the
 * drawer and the requests list read these from here.
 */

/** Where a vendor's reply link lands. */
export const RESPOND_PATH = '/vendor/respond';

/**
 * Where every sandbox order's email goes while the flow is in testing
 * (Matthew, Nov 6 2026): his own inbox, hardcoded on purpose, so a vendor's
 * reply links can be pressed from a real mail client. No house is ever
 * addressed by a sandbox order.
 */
export const SANDBOX_INBOX = 'mhaines9219@gmail.com';
