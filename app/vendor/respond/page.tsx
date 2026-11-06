/**
 * /vendor/respond?t=<token> — where a vendor's reply link lands (FUT-5).
 *
 * Public: the signed token is the whole credential, so there is no session
 * and middleware does not match this path. Opening the page records the
 * answer (lib/vendor-respond.ts) and confirms it in one short sheet, with the
 * other answer one link away. A bad, stale or foreign link gets a plain
 * "expired" page, never an error.
 */

import { respondToVendorLink, type RespondResult } from '@/lib/vendor-respond';
import { ACTION_LABEL } from '@/lib/vendor-links';
import { PageShell } from '@/components/ap/page-shell';
import { StatusToken, itemStatusSpec } from '@/components/ap/status-token';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ t?: string | string[] }> };

export default async function VendorRespondPage({ searchParams }: Props) {
  const { t } = await searchParams;
  const token = typeof t === 'string' ? t : '';
  const result: RespondResult = token ? await respondToVendorLink(token) : { ok: false, reason: 'invalid' };

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6 py-12 md:py-16">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Vendor reply</p>
        {result.ok ? <Confirmed result={result} /> : <Expired />}
      </div>
    </PageShell>
  );
}

function Confirmed({ result }: { result: RespondResult & { ok: true } }) {
  const spec = itemStatusSpec(result.status);
  return (
    <>
      <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
        Thanks, {result.vendorName}.
      </h1>
      <div className="mt-6 border-[1.5px] border-ink bg-card p-5">
        <p className="font-medium leading-snug">{result.itemName}</p>
        <div className="mt-3 flex items-center gap-3">
          <StatusToken {...spec} />
          <span className="font-mono text-[13px] text-text-secondary">
            {result.changed ? 'Marked on the order.' : 'Already marked. Nothing changed.'}
          </span>
        </div>
      </div>
      <p className="mt-6 max-w-[560px] text-[15px] leading-[23px] text-text-secondary">
        The production sees this on their order now. For a quote or anything else, reply to the request email.
      </p>
      <a
        href={result.flip.url}
        className="mt-6 inline-block border-[1.5px] border-ink bg-card px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-foreground transition-colors hover:bg-surface-inset"
      >
        Wrong answer? {ACTION_LABEL[result.flip.action]}
      </a>
    </>
  );
}

function Expired() {
  return (
    <>
      <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">This link has expired.</h1>
      <p className="mt-4 max-w-[560px] text-[15px] leading-[23px] text-text-secondary">
        Reply to the request email instead and the production will update the order.
      </p>
    </>
  );
}
