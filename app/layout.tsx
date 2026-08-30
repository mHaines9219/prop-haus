import './globals.css';

import type { Metadata } from 'next';
import { Anybody, Spline_Sans_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { Providers } from './providers';

// ANSWER PRINT type kit (DESIGN.md section 5): Anybody is the projector title
// card, Switzer the reading grotesk, Spline Sans Mono the camera report.
const anybody = Anybody({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-anybody',
  display: 'swap',
});

const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-spline-mono',
  display: 'swap',
});

const switzer = localFont({
  src: './fonts/Switzer-Variable.woff2',
  weight: '100 900',
  variable: '--font-switzer',
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
      className={`${anybody.variable} ${switzer.variable} ${splineMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
