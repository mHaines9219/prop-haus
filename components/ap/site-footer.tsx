export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-sm font-extrabold uppercase leading-none tracking-[0.04em] text-foreground [font-stretch:150%]">
            Prop Haus
          </span>
          <span className="font-mono text-[11px] uppercase leading-none tracking-[0.08em] text-text-tertiary">
            Los Angeles
          </span>
        </div>
        <p className="max-w-[65ch] text-[13px] leading-[19px] text-text-tertiary">
          Prop Haus is an MVP aggregator. All inventory shown belongs to and is owned by the listed
          source. Links lead to the original rental houses; items are surfaced here for discovery
          only.
        </p>
      </div>
    </footer>
  );
}
