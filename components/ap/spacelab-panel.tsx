'use client';

/**
 * "Build your set in 3D" — the Spacelab handoff on the order page (FUT-2).
 *
 * A camera-report row rather than a card (DESIGN.md §9.4.3): what the set is,
 * how much of it has a model, and the one action that opens it. The panel has
 * three shapes:
 *
 *   nothing prepared yet   one button, which builds the room
 *   prepared, deployed     "Open in Spacelab", plus the room file underneath
 *   prepared, no deploy    the room file only, with the import instruction —
 *                          Spacelab has no host yet, and its own "import room"
 *                          button reads this exact file
 */

import { useState } from 'react';

export type PreparedSceneView = {
  id: string;
  itemCount: number;
  modelReadyCount: number;
  roomUrl: string | null;
  roomFileUrl: string;
  catalogUrl: string;
  updatedAt: string;
};

type Props = { orderId: string; initialScene: PreparedSceneView | null };

export function SpacelabPanel({ orderId, initialScene }: Props) {
  const [scene, setScene] = useState<PreparedSceneView | null>(initialScene);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/spacelab/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not build the room.');
      }
      setScene((await res.json()) as PreparedSceneView);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the room.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="font-heading text-[15px] font-bold tracking-[-0.02em]">Set preview</h2>
        {scene && (
          <p className="font-mono text-[12px] tabular-nums text-text-tertiary">
            {modelCopy(scene)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
        <p className="min-w-0 flex-1 font-sans text-[14px] leading-snug text-text-secondary">
          {scene
            ? 'Your order is staged in a room. Arrange it, then send the plan to the crew.'
            : 'Arrange this order in a 3D room. Every item becomes a 3D object built from its listing photo.'}
        </p>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!scene && (
            <button
              type="button"
              onClick={prepare}
              disabled={busy}
              className="rounded-md border border-accent px-4 py-2.5 font-mono text-[13px] text-accent-text transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {busy ? 'Building…' : 'Build your set in 3D'}
            </button>
          )}

          {scene?.roomUrl && (
            <a
              href={scene.roomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-accent px-4 py-2.5 font-mono text-[13px] text-accent-text transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Open in Spacelab
            </a>
          )}

          {scene && (
            <a
              href={scene.roomFileUrl}
              className="rounded-md border border-border px-4 py-2.5 font-mono text-[13px] text-foreground transition-colors hover:bg-surface-raised"
            >
              Room file
            </a>
          )}

          {scene && (
            <button
              type="button"
              onClick={prepare}
              disabled={busy}
              className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {busy ? 'Rebuilding…' : 'Rebuild'}
            </button>
          )}
        </div>
      </div>

      {scene && !scene.roomUrl && (
        <p className="pb-2 font-mono text-[12px] text-text-tertiary">
          Spacelab has no deployment yet. Download the room file and open it with Spacelab&rsquo;s
          &ldquo;import room&rdquo; button.
        </p>
      )}

      {scene && scene.modelReadyCount < scene.itemCount && (
        <p className="pb-2 font-mono text-[12px] text-text-tertiary">
          {scene.itemCount - scene.modelReadyCount} item
          {scene.itemCount - scene.modelReadyCount === 1 ? '' : 's'} still without a model. They are
          in the room file and appear once their model is built. Rebuild to pick them up.
        </p>
      )}

      {error && <p className="pb-2 font-mono text-[12px] text-status-unavailable">{error}</p>}
    </div>
  );
}

function modelCopy(scene: PreparedSceneView): string {
  if (scene.itemCount === 0) return 'No items on this order.';
  if (scene.modelReadyCount === scene.itemCount) {
    return `${scene.itemCount} of ${scene.itemCount} items modeled`;
  }
  return `${scene.modelReadyCount} of ${scene.itemCount} items modeled`;
}
