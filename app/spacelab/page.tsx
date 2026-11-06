import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ap/page-shell';
import { SpacelabStudio } from '@/components/spacelab/studio';
import { requireOrgId } from '@/lib/session';
import { sceneForOrder } from '@/lib/spacelab/studio/from-order';
import type { Scene } from '@/lib/spacelab/studio/scene';

export const metadata = {
  title: 'Space Lab — Prop Haus',
  description: 'Arrange an order in a 3D room by talking to it.',
};

/**
 * /spacelab — the 3D modeler. On its own it opens a placeholder set.
 * /spacelab?order=<id> opens that order's pieces staged in a room sized for
 * them; the order has to be the signed-in org's, so this asks for a session
 * the way the order page does.
 */
export default async function SpacelabPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const { order } = await searchParams;
  const orderId = typeof order === 'string' ? order : undefined;

  let initialScene: Scene | undefined;
  if (orderId) {
    const orgId = await requireOrgId(`/spacelab?order=${encodeURIComponent(orderId)}`);
    try {
      initialScene = await sceneForOrder(orderId, orgId);
    } catch {
      notFound();
    }
  }

  return (
    <PageShell mainClassName="min-h-[640px]">
      <SpacelabStudio initialScene={initialScene} order={orderId ? { id: orderId } : undefined} />
    </PageShell>
  );
}
