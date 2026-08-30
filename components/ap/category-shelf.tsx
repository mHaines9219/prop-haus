import Link from 'next/link';

type Category = { name: string; href: string; count: number };

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function CategoryShelf({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;

  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {categories.map((cat, i) => (
            <Link
              key={cat.name}
              href={cat.href}
              className={`group relative flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors duration-200 hover:border-border-strong${i === categories.length - 1 && categories.length % 2 !== 0 ? ' col-span-2' : ''}`}
            >
              {/* Photo area — placeholder until category hero images are added */}
              <div
                className="flex flex-1 items-center justify-center"
                style={{ minHeight: 180 }}
                aria-hidden
              >
                <div className="flex flex-col items-center gap-2 rounded border border-dashed border-border p-5 text-text-disabled">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="2" y="4" width="18" height="14" rx="2" />
                    <circle cx="8" cy="10" r="2" />
                    <path d="M2 16l4-4 3 3 4-5 7 6" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {/* Label area */}
              <div className="border-t border-border px-5 pb-5 pt-4">
                <p className="font-heading text-[13px] font-bold uppercase tracking-[0.05em] text-foreground">
                  {cat.name}
                </p>
                <p className="mt-1 text-[12px]">
                  <span className="font-mono text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ml-2 text-text-tertiary">{fmtCount(cat.count)} items</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
