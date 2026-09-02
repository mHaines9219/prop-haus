'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { MAX_PAPERWORK_BYTES, checkPaperworkFile } from '@/lib/paperwork';
import { ApiError, postForm } from '@/lib/api';

/**
 * Paperwork upload. One file per request, several files per pick — each goes up
 * on its own so one bad file doesn't sink the rest. The same validation the
 * server runs (lib/paperwork.ts) runs here first, so the obvious refusals are
 * instant and never spend an upload.
 */
export function UploadForm({ projectId, folderId }: { projectId: string; folderId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const failed: string[] = [];
    let saved = 0;

    for (const file of list) {
      const check = checkPaperworkFile({ name: file.name, mime: file.type, size: file.size });
      if (!check.ok) {
        failed.push(check.reason);
        continue;
      }
      setBusy(file.name);
      const form = new FormData();
      form.append('file', file, file.name);
      try {
        await postForm(`/api/projects/${projectId}/folders/${folderId}/documents`, form);
        saved += 1;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        failed.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
      }
    }

    setBusy(null);
    setErrors(failed);
    if (inputRef.current) inputRef.current.value = '';
    if (saved > 0) router.refresh();
  }

  return (
    <div className="border-b border-border py-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        className={
          'flex flex-col items-start gap-3 border border-dashed px-4 py-5 transition-colors duration-150 sm:flex-row sm:items-center sm:justify-between ' +
          (dragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-border')
        }
      >
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-[22px] text-foreground">
            {busy ? `Uploading ${busy}…` : 'Drop paperwork here'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] leading-[16px] text-text-tertiary">
            COIs, W9s, invoices, call sheets, deal memos. PDF, image, or Office file up to{' '}
            {Math.round(MAX_PAPERWORK_BYTES / 1024 / 1024)} MB each.
          </p>
        </div>
        <label
          className={
            'inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-emerald-500 px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-emerald-400 transition-colors hover:bg-emerald-500/10 ' +
            (busy ? 'pointer-events-none opacity-50' : '')
          }
        >
          <Upload size={14} strokeWidth={1.5} aria-hidden />
          Choose files
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files);
            }}
          />
        </label>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {errors.map((msg) => (
            <li key={msg} className="font-mono text-[12px] text-accent-text">
              {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
