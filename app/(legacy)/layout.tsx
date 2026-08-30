import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { AuthButton } from '@/components/auth-button';
import { CartButton } from '@/components/cart-button';
import { SearchBar } from '@/components/search-bar';

const NAV = [
  { label: 'Seating', href: '/category/seating' },
  { label: 'Lighting', href: '/category/lighting' },
  { label: 'Themed', href: '/category/themed-event' },
  { label: 'Folders', href: '/projects' },
];

// Astryx chrome for pages not yet migrated to the Answer Print design
// language (see DESIGN.md). The home page renders its own chrome.
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
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
          endContent={
            <div className="flex items-center gap-2">
              <CartButton />
              <AuthButton />
            </div>
          }
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
  );
}
