'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CREW_COPY, ROSTER_MAX_FILE_BYTES, ROSTER_MAX_WORK_PHOTOS } from '@/lib/crew';

type Status = 'idle' | 'submitting' | 'sent' | 'error';

/** "Join the roster" button + the application modal it opens. The application
 *  (name, email, headshot, up to 5 work photos) POSTs as multipart form data
 *  to /api/crew/roster-applications, which emails the crew inbox. */
export function JoinRoster() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  const [status, setStatus] = useState<Status>('idle');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [social, setSocial] = useState('');
  const [company, setCompany] = useState(''); // honeypot; humans never see it
  const [headshot, setHeadshot] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => nameRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  /** Keep images under the per-file cap; report anything dropped. */
  function acceptImages(list: FileList | null, room: number): File[] {
    const picked = Array.from(list ?? []);
    const kept = picked.filter((f) => f.type.startsWith('image/') && f.size <= ROSTER_MAX_FILE_BYTES);
    const dropped = picked.length - kept.length;
    const overflow = Math.max(0, kept.length - room);
    setFileNote(
      [
        dropped ? `${dropped} skipped (images under 5 MB only)` : '',
        overflow ? `only ${ROSTER_MAX_WORK_PHOTOS} work photos — ${overflow} not added` : '',
      ]
        .filter(Boolean)
        .join('; '),
    );
    return kept.slice(0, room);
  }

  // Every field is required: applications are vetted, so a name, a reachable
  // email, a web presence, a headshot and at least one work photo must all be there.
  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    website.trim().length > 0 &&
    social.trim().length > 0 &&
    headshot !== null &&
    photos.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || status === 'submitting') return;
    setStatus('submitting');
    setErrorMsg('');

    const fd = new FormData();
    fd.set('name', name.trim());
    fd.set('email', email.trim());
    fd.set('website', website.trim());
    fd.set('social', social.trim());
    fd.set('company', company);
    fd.set('headshot', headshot!);
    photos.forEach((p) => fd.append('photos', p));

    try {
      const res = await fetch('/api/crew/roster-applications', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Something went wrong');
      }
      setStatus('sent');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 shrink-0 items-center rounded-md border border-border px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary transition-colors duration-150 hover:bg-card hover:text-foreground"
      >
        {CREW_COPY.joinCta}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={reduce ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden
            />

            <motion.div
              key="modal"
              role="dialog"
              aria-modal
              aria-label={CREW_COPY.joinCta}
              initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30, duration: 0.22 }}
              className="fixed inset-x-0 top-[8vh] z-50 mx-auto w-full max-w-lg px-4"
            >
              <div className="max-h-[84vh] overflow-y-auto rounded-[14px] border border-border bg-card shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                      {CREW_COPY.joinEyebrow}
                    </p>
                    <h2 className="font-display text-[20px] font-bold leading-tight text-foreground">
                      {CREW_COPY.joinCta}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-sm text-text-tertiary transition-colors duration-150 hover:text-foreground"
                  >
                    <X size={18} strokeWidth={1.5} />
                  </button>
                </div>

                {status === 'sent' ? (
                  <div className="space-y-4 p-5">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-confirmed)]" />
                      <p className="text-[15px] leading-[23px] text-text-secondary">
                        Application sent — we&apos;ll be in touch.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="h-9 rounded-md border border-border px-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-foreground transition-colors duration-150 hover:bg-foreground/7"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submit} className="space-y-5 p-5">
                    <label className="block space-y-2">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                        Name
                      </span>
                      <input
                        ref={nameRef}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="h-10 w-full rounded-md border border-border bg-card px-3 font-mono text-[14px] text-foreground outline-none transition-colors duration-150 placeholder:text-text-tertiary focus:border-accent"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                        Email
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-10 w-full rounded-md border border-border bg-card px-3 font-mono text-[14px] text-foreground outline-none transition-colors duration-150 placeholder:text-text-tertiary focus:border-accent"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                        Website
                      </span>
                      <input
                        type="text"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="yourportfolio.com"
                        className="h-10 w-full rounded-md border border-border bg-card px-3 font-mono text-[14px] text-foreground outline-none transition-colors duration-150 placeholder:text-text-tertiary focus:border-accent"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                        Social media
                      </span>
                      <input
                        type="text"
                        value={social}
                        onChange={(e) => setSocial(e.target.value)}
                        placeholder="@handle or link"
                        className="h-10 w-full rounded-md border border-border bg-card px-3 font-mono text-[14px] text-foreground outline-none transition-colors duration-150 placeholder:text-text-tertiary focus:border-accent"
                      />
                    </label>

                    {/* Honeypot: visually hidden, tabbed past, bots fill it anyway. */}
                    <input
                      type="text"
                      name="company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden
                      className="hidden"
                    />

                    <FilePicker
                      label="Headshot"
                      hint="One photo of you — it becomes your directory picture."
                      files={headshot ? [headshot] : []}
                      round
                      onPick={(list) => setHeadshot(acceptImages(list, 1)[0] ?? null)}
                      onRemove={() => setHeadshot(null)}
                    />

                    <FilePicker
                      label={`Work photos (1–${ROSTER_MAX_WORK_PHOTOS})`}
                      hint="Sets you dressed, runs, builds — anything that shows your work."
                      files={photos}
                      multiple
                      disabled={photos.length >= ROSTER_MAX_WORK_PHOTOS}
                      onPick={(list) =>
                        setPhotos((prev) => [...prev, ...acceptImages(list, ROSTER_MAX_WORK_PHOTOS - prev.length)])
                      }
                      onRemove={(i) => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    />

                    {fileNote && <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">{fileNote}</p>}
                    {status === 'error' && errorMsg && (
                      <p className="font-mono text-[12px] text-accent-text">{errorMsg}</p>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="h-9 rounded-md border border-border px-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-foreground transition-colors duration-150 hover:bg-foreground/7"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!canSubmit || status === 'submitting'}
                        className="h-9 rounded-md border border-accent px-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-accent transition-colors duration-150 hover:bg-accent/12 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {status === 'submitting' ? 'Sending…' : 'Send application'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function FilePicker({
  label,
  hint,
  files,
  multiple = false,
  round = false,
  disabled = false,
  onPick,
  onRemove,
}: {
  label: string;
  hint: string;
  files: File[];
  multiple?: boolean;
  round?: boolean;
  disabled?: boolean;
  onPick: (list: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        {files.map((f, i) => (
          <Thumb key={`${f.name}-${i}`} file={f} round={round} onRemove={() => onRemove(i)} />
        ))}
        {/* The + tile IS the label; clicking it opens the native picker, and the
            sr-only input inside stays focusable and named for assistive tech. */}
        <label
          className={cn(
            'flex h-16 w-16 items-center justify-center border border-dashed border-border font-mono text-[20px] font-light text-text-tertiary transition-colors duration-150',
            round ? 'rounded-full' : 'rounded-md',
            disabled
              ? 'cursor-not-allowed opacity-40'
              : 'cursor-pointer hover:border-accent hover:text-accent focus-within:border-accent focus-within:text-accent',
          )}
        >
          <span aria-hidden>+</span>
          <input
            type="file"
            accept="image/*"
            multiple={multiple}
            disabled={disabled}
            aria-label={`Add ${label.toLowerCase()}`}
            className="sr-only"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = ''; // allow re-picking the same file
            }}
          />
        </label>
      </div>
      <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">{hint}</p>
    </div>
  );
}

function Thumb({ file, round, onRemove }: { file: File; round: boolean; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className={cn('relative h-16 w-16 overflow-hidden border border-border bg-background', round ? 'rounded-full' : 'rounded-md')}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
      <img src={url} alt={file.name} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100"
      >
        <X size={14} strokeWidth={2} className="text-foreground" />
      </button>
    </div>
  );
}
