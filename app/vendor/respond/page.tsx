/**
 * /vendor/respond?t=<token> — where a vendor's reply link lands (FUT-5).
 *
 * Public: the signed token is the whole credential, so there is no session
 * and middleware does not match this path. This page only READS: it names
 * the line and offers one button, and the button's POST (/api/vendor/respond)
 * is what records the answer. Mail scanners fetch every link in an email, so
 * a page that wrote on GET would answer for the vendor, both ways. After the
 * POST the page shows the result (`r`) and the other answer one link away.
 * A bad, stale or foreign link gets a plain "expired" page, never an error.
 */

import type { Metadata } from 'next';
import { readVendorLink, type VendorLine } from '@/lib/vendor-respond';
import { ACTION_LABEL, STATUS_FOR_ACTION } from '@/lib/vendor-links';
import { PageShell } from '@/components/ap/page-shell';
import { StatusToken, itemStatusSpec } from '@/components/ap/status-token';

export const dynamic = 'force-dynamic';

/** The token is in the query string; keep it out of other sites' logs. */
export const metadata: Metadata = { referrer: 'no-referrer' };

type Props = { searchParams: Promise<{ t?: string | string[]; r?: string | string[] }> };

const BUTTON =
  'inline-block border-[1.5px] border-ink bg-card px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-foreground transition-colors hover:bg-surface-inset';

type View =
  | { kind: 'expired' }
  | { kind: 'failed'; line?: VendorLine }
  | { kind: 'ask'; line: VendorLine }
  | { kind: 'confirmed'; line: VendorLine; changed: boolean };

/** Which sheet to show, decided from the token and the outcome of a POST. */
async function resolveView(token: string, outcome: string): Promise<View> {
  if (!token) return { kind: 'expired' };
  try {
    const read = await readVendorLink(token);
    if (!read.ok) return { kind: 'expired' };
    if (outcome === 'changed' || outcome === 'same') return { kind: 'confirmed', line: read.line, changed: outcome === 'changed' };
    if (outcome === 'error') return { kind: 'failed', line: read.line };
    return { kind: 'ask', line: read.line };
  } catch (err) {
    console.error('[vendor/respond] read failed', err);
    return { kind: 'failed' };
  }
}

export default async function VendorRespondPage({ searchParams }: Props) {
  const { t, r } = await searchParams;
  const token = typeof t === 'string' ? t : '';
  const view = await resolveView(token, typeof r === 'string' ? r : '');

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6 py-12 md:py-16">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Vendor reply</p>
        {view.kind === 'expired' && <Expired />}
        {view.kind === 'failed' && <Failed line={view.line} token={token} />}
        {view.kind === 'ask' && <Ask line={view.line} token={token} />}
        {view.kind === 'confirmed' && <Confirmed line={view.line} changed={view.changed} />}
      </div>
    </PageShell>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">{children}</h1>;
}

function LineCard({ line, status, note }: { line: VendorLine; status: VendorLine['status']; note: string }) {
  return (
    <div className="mt-6 border-[1.5px] border-ink bg-card p-5">
      <p className="font-medium leading-snug">{line.itemName}</p>
      <div className="mt-3 flex items-center gap-3">
        <StatusToken {...itemStatusSpec(status)} />
        <span className="font-mono text-[13px] text-text-secondary">{note}</span>
      </div>
    </div>
  );
}

/** One button. The answer is recorded only when it is pressed. */
function Ask({ line, token }: { line: VendorLine; token: string }) {
  return (
    <>
      <Heading>Hello, {line.vendorName}.</Heading>
      <LineCard line={line} status={line.status} note="On the order today." />
      <form method="post" action="/api/vendor/respond" className="mt-6">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className={BUTTON}>
          {ACTION_LABEL[line.action]}
        </button>
      </form>
      <p className="mt-4 max-w-[560px] text-[15px] leading-[23px] text-text-secondary">
        One press marks it on the production&apos;s order. For a quote or anything else, reply to the request email.
      </p>
    </>
  );
}

function Confirmed({ line, changed }: { line: VendorLine; changed: boolean }) {
  return (
    <>
      <Heading>Thanks, {line.vendorName}.</Heading>
      <LineCard line={line} status={STATUS_FOR_ACTION[line.action]} note={changed ? 'Marked on the order.' : 'Already marked. Nothing changed.'} />
      <p className="mt-6 max-w-[560px] text-[15px] leading-[23px] text-text-secondary">
        The production sees this on their order now. For a quote or anything else, reply to the request email.
      </p>
      <a href={line.flip.url} className={`mt-6 ${BUTTON}`}>
        Wrong answer? {ACTION_LABEL[line.flip.action]}
      </a>
    </>
  );
}

function Failed({ line, token }: { line?: VendorLine; token: string }) {
  return (
    <>
      <Heading>That did not go through.</Heading>
      <p className="mt-4 max-w-[560px] text-[15px] leading-[23px] text-text-secondary">
        Nothing was marked. Try once more, or reply to the request email.
      </p>
      {line && (
        <form method="post" action="/api/vendor/respond" className="mt-6">
          <input type="hidden" name="t" value={token} />
          <button type="submit" className={BUTTON}>
            {ACTION_LABEL[line.action]}
          </button>
        </form>
      )}
    </>
  );
}

function Expired() {
  return (
    <>
      <Heading>This link has expired.</Heading>
      <p className="mt-4 max-w-[560px] text-[15px] leading-[23px] text-text-secondary">
        Reply to the request email instead and the production will update the order.
      </p>
    </>
  );
}
