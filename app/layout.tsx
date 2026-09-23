import './globals.css';

import type { Metadata } from 'next';
import { Archivo, Fraunces } from 'next/font/google';
import { Providers } from './providers';

// Party Line type kit (DESIGN.md §5):
//   Archivo, with its width axis, is the ad-headline gothic. Drawn at 80%
//   width for headlines/labels/buttons (.font-heading) and at full width for
//   data (.font-mono, which is Archivo too: the phonebook has no monospace).
//   Fraunces is the bank-sign serif for page titles and the hero.
//   Helvetica Neue (system) is the listing body face; nothing to load.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Prop Haus: LA Production Rentals',
  description:
    'Aggregated rental props from LA prop houses. Search and browse by category, and save pieces into project folders.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the theme attribute on <html>
    // before hydration, which the server render can't know about.
    <html
      lang="en"
      className={`${archivo.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
