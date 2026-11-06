import { PageShell } from '@/components/ap/page-shell';
import { SpacelabStudio } from '@/components/spacelab/studio';

export const metadata = {
  title: 'Space Lab — Prop Haus',
  description: 'Arrange an order in a 3D room by talking to it.',
};

/**
 * /spacelab — the 3D modeler. Scaffold only (Nov 2026): the four panels are
 * laid out and filled with placeholder data; nothing renders or talks to a
 * model yet. The sheet fills the viewport between nav and footer so the
 * studio behaves like an app surface, not a scrolling page.
 */
export default function SpacelabPage() {
  return (
    <PageShell mainClassName="min-h-[640px]">
      <SpacelabStudio />
    </PageShell>
  );
}
