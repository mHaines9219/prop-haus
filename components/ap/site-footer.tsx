/**
 * Party Line footer (DESIGN.md §9.1): the binder's bottom edge. Green vinyl in
 * both themes, with the publisher's line the way a directory's spine reads
 * ("LA Universal Advertising Inc."): small, spaced, cream on green.
 */
export function SiteFooter() {
  return (
    <footer className="bg-binder text-paper">
      <div aria-hidden className="h-px w-full bg-ink/60" />
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-3 py-8 sm:px-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-baseline gap-3">
          <span className="shrink-0 whitespace-nowrap font-heading text-[14px] font-extrabold uppercase leading-none tracking-[0.04em] text-paper">
            Prop Haus
          </span>
          <span className="font-heading text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-paper/70">
            Los Angeles · Production Rental Directory
          </span>
        </div>
        <p className="max-w-[64ch] text-[12px] leading-[18px] text-paper/70">
          Prop Haus is an MVP aggregator. All inventory shown belongs to and is owned by the listed
          source. Links lead to the original rental houses; items are surfaced here for discovery
          only.
        </p>
      </div>
    </footer>
  );
}
