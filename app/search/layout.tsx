import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Search · Prop Haus' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
