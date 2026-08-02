// Astryx layers, in cascade order, before the app's own globals (Tailwind).
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-stone/theme.css';
import './globals.css';

import type { Metadata } from 'next';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { CartButton } from '@/components/cart-button';
import { SearchBar } from '@/components/search-bar';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Prop Haus — LA Production Rentals',
  description: 'Aggregated rental props from LA prop houses. Browse by category and build a quote request.',
};

const NAV = [
  { label: 'Seating', href: '/category/seating' },
  { label: 'Lighting', href: '/category/lighting' },
  { label: 'Themed', href: '/category/themed-event' },
  { label: 'Jobs', href: '/projects' },
  { label: 'Insurance', href: '/onboarding/insurance' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell
            height="auto"
            variant="section"
            topNav={
              <TopNav
                heading={<TopNavHeading heading="Prop Haus" headingHref="/" />}
                startContent={NAV.map((n) => (
                  <TopNavItem key={n.href} label={n.label} href={n.href} />
                ))}
                centerContent={
                  <div className="hidden w-full max-w-xl sm:block">
                    <SearchBar />
                  </div>
                }
                endContent={<CartButton />}
              />
            }
          >
            <div className="mx-auto w-full max-w-7xl px-4 py-8">{children}</div>
            <Section variant="muted" dividers={['top']}>
              <div className="mx-auto w-full max-w-7xl px-4 py-10">
                <Text type="supporting" color="secondary">
                  Prop Haus is an MVP aggregator. All inventory shown belongs to and is owned by the
                  listed source. Links lead to the original rental houses; items are surfaced here for
                  discovery only.
                </Text>
              </div>
            </Section>
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
