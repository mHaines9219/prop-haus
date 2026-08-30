import './globals.css';

import type { Metadata } from 'next';
import { Archivo, Spline_Sans_Mono } from 'next/font/google';
import { Providers } from './providers';

// Nocturne type kit: Archivo is the heading face, Helvetica Neue the reading
// grotesk (system font, no loading needed), Spline Sans Mono the data face.
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
  display: 'swap',
});

const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-spline-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Prop Haus: LA Production Rentals',
  description:
    'Aggregated rental props from LA prop houses. Search and browse by category, and save pieces into project folders.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html>
    // before hydration, which the server render can't know about.
    <html
      lang="en"
      className={`${archivo.variable} ${splineMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
