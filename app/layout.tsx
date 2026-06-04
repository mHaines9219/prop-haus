import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CartButton } from '@/components/cart-button';
import { SearchBar } from '@/components/search-bar';

export const metadata: Metadata = {
  title: 'Prop Haus — NYC Production Rentals',
  description: 'Aggregated rental props from NYC prop houses. Browse by category and build a quote request.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-ink/15 bg-paper/90 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-6">
            <Link href="/" className="font-display text-2xl tracking-wide shrink-0">
              Prop&nbsp;Haus
            </Link>
            <div className="flex-1 hidden sm:block">
              <SearchBar />
            </div>
            <nav className="hidden lg:flex gap-5 text-xs font-sans uppercase tracking-widest shrink-0">
              <Link href="/category/seating">Seating</Link>
              <Link href="/category/lighting">Lighting</Link>
              <Link href="/category/themed-event">Themed</Link>
              <Link href="/onboarding/insurance">Insurance</Link>
            </nav>
            <CartButton />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-12 text-xs font-sans text-ink/60 border-t border-ink/15 mt-16">
          Prop Haus is an MVP aggregator. All inventory shown belongs to and is owned by the listed source.
          Links lead to the original rental houses; items are surfaced here for discovery only.
        </footer>
      </body>
    </html>
  );
}
