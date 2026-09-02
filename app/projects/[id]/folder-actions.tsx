'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteJson } from '@/lib/api';

/**
 * Quiet per-row controls for a folder: rename (inline) and, for scene folders,
 * delete. Rendered beside the row's <Link>, never inside it — a button inside
 * an anchor is invalid markup and fights the click.
 */
export function FolderActions({
  projectId,
  folderId,
  name,
  kind,
  itemCount,
}: {
  projectId: string;
  folderId: string;
  name: string;
  kind: 'scene' | 'paperwork';
  itemCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);

  function cancel() {
    setEditing(false);
    setDraft(name);
  }

  async function rename() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      cancel();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const what =
      itemCount > 0
        ? `Delete “${name}” and the ${itemCount} item${itemCount === 1 ? '' : 's'} saved in it?`
        : `Delete “${name}”?`;
    if (!window.confirm(what)) return;
    setBusy(true);
    try {
      await deleteJson(`/api/projects/${projectId}/folders/${folderId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void rename();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel();
          }}
          maxLength={120}
          autoFocus
          disabled={busy}
          aria-label="Folder name"
          className="h-8 w-48 rounded-md border border-border bg-surface-inset px-2 font-mono text-[12px] text-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-8 rounded-md border border-emerald-500 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <span className="flex items-center gap-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors duration-150 hover:text-foreground disabled:opacity-40"
      >
        Rename
      </button>
      {kind === 'scene' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors duration-150 hover:text-accent-text disabled:opacity-40"
        >
          Delete
        </button>
      )}
    </span>
  );
}
