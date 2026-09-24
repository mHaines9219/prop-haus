'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, patchJson, postJson } from '@/lib/api';
import { PRODUCTION_TYPES } from '@/lib/accounts';
import type { IntakeTurn } from '@/lib/intake/turn';
import {
  LOCATION_KINDS,
  PRODUCTION_LABELS,
  isClientWork,
  mergeProjectProfile,
  profileGaps,
  unsetProfilePaths,
  type LocationKind,
  type ProjectProfile,
} from '@/lib/project-profile';
import { cn } from '@/lib/utils';

/**
 * The production form: the project profile as controls, one row per fact the
 * requirements engine reads. Edits stay on the page until "Save" writes them
 * through the profile PATCH route; "Generate paperwork checklist" saves what
 * is pending and re-renders the checklist on the right (router.refresh()).
 * Nothing on the right moves while the user is still typing.
 *
 * A one-shot description sits on top: paste a sentence, the intake extractor
 * fills what it can, and the rows below are the record. Nothing is asked in
 * a conversation; what is still open is marked on the row that answers it.
 */
export function ProfileForm({
  projectId,
  initialProfile,
  provider,
}: {
  projectId: string;
  initialProfile: ProjectProfile;
  provider: 'mock' | 'openrouter';
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<ProjectProfile>(initialProfile);
  const [profile, setProfile] = useState<ProjectProfile>(initialProfile);
  const [busy, setBusy] = useState<'save' | 'generate' | null>(null);
  const [description, setDescription] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);
  const open = new Set(profileGaps(profile).map((g) => g.key));

  /** Change the draft. Nothing leaves the page until Save. */
  const edit = useCallback((patch: ProjectProfile, unset: string[] = []) => {
    setProfile((p) => unsetProfilePaths(mergeProjectProfile(p, patch, { lists: 'replace' }), unset));
  }, []);

  function redirectToLogin() {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  /** Write the draft. Sends the whole draft (lists replace) plus the paths it no longer has. */
  async function persist(): Promise<boolean> {
    if (!dirty) return true;
    setError('');
    try {
      const unset = forgottenPaths(saved, profile);
      await patchJson(`/api/projects/${projectId}/profile`, unset.length > 0 ? { ...profile, unset } : profile);
      setSaved(profile);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin();
        return false;
      }
      setError('That did not save. Try again.');
      return false;
    }
  }

  async function save() {
    setBusy('save');
    await persist();
    setBusy(null);
  }

  async function generate() {
    setBusy('generate');
    if (await persist()) router.refresh();
    setBusy(null);
  }

  async function read(e?: React.FormEvent) {
    e?.preventDefault();
    const message = description.trim();
    if (!message || reading) return;
    setReading(true);
    setError('');
    try {
      const turn = await postJson<IntakeTurn>(`/api/projects/${projectId}/intake`, { message });
      // The intake route stores what it read, so the draft and the record agree.
      setSaved(turn.profile);
      setProfile(turn.profile);
      setDescription('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin();
        return;
      }
      setError('That did not go through. Try again.');
    } finally {
      setReading(false);
    }
  }

  const bool = (path: string, value: boolean | undefined) => {
    const [section, key] = path.split('.');
    return value === undefined ? edit({}, [path]) : edit({ [section]: { [key]: value } } as ProjectProfile);
  };

  const showVenue = Boolean(profile.locations?.kinds?.includes('venue') || profile.venue);
  const showClient = isClientWork(profile) || Boolean(profile.client);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-border pb-2">
          <h2 className="text-[18px] font-semibold leading-[24px] text-foreground">Tell us about the production</h2>
          <div className="flex items-baseline gap-4 whitespace-nowrap">
            {provider === 'mock' && (
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary" title="Set OPENROUTER_API_KEY to use the model">
                Mock intake
              </span>
            )}
            <SaveState dirty={dirty} />
          </div>
        </div>

        <form onSubmit={read} className="mt-4 flex flex-col gap-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void read();
              }
            }}
            placeholder="Describe it in a sentence: a 10-day indie film in Brooklyn, 15 crew, props from three vendors, one child actor, a stunt scene, a rented box truck."
            rows={2}
            maxLength={4000}
            disabled={reading}
            aria-label="Describe the production"
            className={cn(INPUT, 'resize-none py-2 leading-[19px]')}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
              We fill in what you say. Everything below stays yours to change.
            </p>
            <button type="submit" disabled={reading || busy !== null || !description.trim()} className={cn(GHOST, 'shrink-0')}>
              {reading ? 'Reading' : 'Fill it in'}
            </button>
          </div>
        </form>
      </section>

      <section aria-label="Production profile">
        <div className="flex items-baseline justify-between">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Production</h3>
          <OpenCount count={open.size} />
        </div>
        <div className="mt-3">
          <Row label="Type" open={open.has('productionType')}>
            <Choice
              name="Type"
              value={profile.productionType}
              options={PRODUCTION_TYPES.map((t) => ({ value: t, label: PRODUCTION_LABELS[t] }))}
              onChange={(v) => (v === undefined ? edit({}, ['productionType']) : edit({ productionType: v }))}
            />
          </Row>
          <Row label="Dates" open={open.has('schedule')}>
            <div className="flex flex-wrap items-center gap-2">
              <DateInput label="Start date" value={profile.schedule?.start} onCommit={(v) => (v ? edit({ schedule: { start: v } }) : edit({}, ['schedule.start']))} />
              <span className="font-mono text-[11px] text-text-tertiary">to</span>
              <DateInput label="End date" value={profile.schedule?.end} onCommit={(v) => (v ? edit({ schedule: { end: v } }) : edit({}, ['schedule.end']))} />
            </div>
          </Row>
          <Row label="Shoot days" open={open.has('schedule')} last>
            <NumberInput label="Shoot days" value={profile.schedule?.shootDays} min={1} onCommit={(n) => (n === undefined ? edit({}, ['schedule.shootDays']) : edit({ schedule: { shootDays: n } }))} />
          </Row>
        </div>
      </section>

      <Group label="Where">
        <Row label="City" open={open.has('locations.city')}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <TextInput label="City" placeholder="City" value={profile.locations?.city} onCommit={(v) => (v ? edit({ locations: { city: v } }) : edit({}, ['locations.city']))} />
            <TextInput label="State or region" placeholder="State or region" value={profile.locations?.region} onCommit={(v) => (v ? edit({ locations: { region: v } }) : edit({}, ['locations.region']))} />
            <TextInput label="Country" placeholder="Country" value={profile.locations?.country} onCommit={(v) => (v ? edit({ locations: { country: v } }) : edit({}, ['locations.country']))} />
          </div>
        </Row>
        <Row label="Locations">
          <NumberInput label="Number of locations" value={profile.locations?.count} min={1} onCommit={(n) => (n === undefined ? edit({}, ['locations.count']) : edit({ locations: { count: n } }))} />
        </Row>
        <Row label="Kinds">
          <Checks
            name="Location kinds"
            options={LOCATION_KINDS.map((k) => ({ value: k, label: LOCATION_KIND_LABELS[k] }))}
            checked={(k) => profile.locations?.kinds?.includes(k as LocationKind) ?? false}
            onToggle={(k, on) => {
              const current = profile.locations?.kinds ?? [];
              const next = on ? [...current, k as LocationKind] : current.filter((x) => x !== k);
              return next.length > 0 ? edit({ locations: { kinds: next } }) : edit({}, ['locations.kinds']);
            }}
          />
        </Row>
        <Row label="Public property" hint="Streets, parks, sidewalks" open={open.has('locations.publicProperty')} last={!showVenue}>
          <YesNo name="Public property" value={profile.locations?.publicProperty} onChange={(v) => bool('locations.publicProperty', v)} />
        </Row>
        {showVenue && (
          <>
            <Row label="Venue">
              <TextInput label="Venue name" placeholder="Venue name" value={profile.venue?.name} onCommit={(v) => (v ? edit({ venue: { name: v } }) : edit({}, ['venue.name']))} />
            </Row>
            <Row label="Venue needs a COI" open={open.has('venue.requiresCoi')}>
              <YesNo name="Venue needs a COI" value={profile.venue?.requiresCoi} onChange={(v) => bool('venue.requiresCoi', v)} />
            </Row>
            <Row label="Install and strike" hint="Load-in and load-out at the venue" last>
              <YesNo name="Install and strike" value={profile.venue?.installStrike} onChange={(v) => bool('venue.installStrike', v)} />
            </Row>
          </>
        )}
      </Group>

      <Group label="People">
        <Row label="Crew" open={open.has('crew.count')}>
          <NumberInput label="Crew count" value={profile.crew?.count} min={0} onCommit={(n) => (n === undefined ? edit({}, ['crew.count']) : edit({ crew: { count: n } }))} />
        </Row>
        <Row label="Contractors" hint="Any crew hired as 1099">
          <YesNo name="Contractors" value={profile.crew?.contractors} onChange={(v) => bool('crew.contractors', v)} />
        </Row>
        <Row label="Union">
          <YesNo name="Union" value={profile.crew?.union} onChange={(v) => bool('crew.union', v)} />
        </Row>
        <Row label="Cast">
          <NumberInput label="Cast count" value={profile.cast?.count} min={0} onCommit={(n) => (n === undefined ? edit({}, ['cast.count']) : edit({ cast: { count: n } }))} />
        </Row>
        <Row label="Minors on set" hint="As cast or crew" open={open.has('cast.minors')} last>
          <YesNo name="Minors on set" value={profile.cast?.minors} onChange={(v) => bool('cast.minors', v)} />
        </Row>
      </Group>

      <Group label="Rentals and vehicles">
        <Row label="Renting" open={open.has('rentals')}>
          <BoolGroup
            name="Renting"
            section="rentals"
            values={profile.rentals}
            options={[
              { key: 'props', label: 'Props' },
              { key: 'furniture', label: 'Furniture' },
              { key: 'equipment', label: 'Equipment' },
            ]}
            none="Nothing rented"
            onCommit={edit}
          />
        </Row>
        <Row label="Vendors" hint="How many you are renting from">
          <NumberInput label="Vendor count" value={profile.rentals?.vendorCount} min={1} onCommit={(n) => (n === undefined ? edit({}, ['rentals.vendorCount']) : edit({ rentals: { vendorCount: n } }))} />
        </Row>
        <Row label="Rented trucks" open={open.has('vehicles.rentedTrucks')}>
          <YesNo name="Rented trucks" value={profile.vehicles?.rentedTrucks} onChange={(v) => bool('vehicles.rentedTrucks', v)} />
        </Row>
        <Row label="Picture vehicles" hint="Cars that appear on camera" last>
          <YesNo name="Picture vehicles" value={profile.vehicles?.pictureVehicles} onChange={(v) => bool('vehicles.pictureVehicles', v)} />
        </Row>
      </Group>

      <Group label="On set">
        <Row label="Risks" open={open.has('risks')} last={!showClient}>
          <BoolGroup
            name="Risks"
            section="risks"
            values={profile.risks}
            options={[
              { key: 'stunts', label: 'Stunts' },
              { key: 'specialEffects', label: 'Special effects' },
              { key: 'pyrotechnics', label: 'Pyrotechnics' },
              { key: 'weapons', label: 'Weapons' },
              { key: 'animals', label: 'Animals' },
              { key: 'drones', label: 'Drones' },
            ]}
            none="None of these"
            onCommit={edit}
          />
        </Row>
        {showClient && (
          <>
            <Row label="Client">
              <TextInput label="Client name" placeholder="Client or agency" value={profile.client?.name} onCommit={(v) => (v ? edit({ client: { name: v } }) : edit({}, ['client.name']))} />
            </Row>
            <Row label="Billing a client" open={open.has('client.billable')} last>
              <YesNo name="Billing a client" value={profile.client?.billable} onChange={(v) => bool('client.billable', v)} />
            </Row>
          </>
        )}
      </Group>

      {profile.facts && profile.facts.length > 0 && (
        <section>
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Also noted</h3>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {profile.facts.map((f) => (
              <li key={f} className="py-2 text-[13px] leading-[19px] text-text-secondary">
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-0 -mx-1 border-t border-border bg-background px-1 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
            {dirty ? 'Unsaved changes.' : 'Everything is saved.'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy !== null || reading || !dirty} className={GHOST}>
              {busy === 'save' ? 'Saving' : 'Save'}
            </button>
            <button type="button" onClick={generate} disabled={busy !== null || reading} className={PRIMARY}>
              {busy === 'generate' ? 'Generating' : 'Generate paperwork checklist'}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 font-mono text-[12px] text-accent-text">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Dotted paths the saved profile has and the draft no longer does, so the
 * route can forget them. Sections are walked one level deep, which is the
 * whole profile shape; `facts` are append-only and never forgotten here.
 */
export function forgottenPaths(before: ProjectProfile, after: ProjectProfile): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(before)) {
    if (key === 'facts' || value === undefined) continue;
    const next = (after as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const section = (next && typeof next === 'object' ? next : {}) as Record<string, unknown>;
      for (const field of Object.keys(value)) {
        if (section[field] === undefined) out.push(`${key}.${field}`);
      }
    } else if (next === undefined) {
      out.push(key);
    }
  }
  return out;
}

// ---- pieces ----

const INPUT =
  'w-full rounded-[2px] border border-border bg-surface-inset px-3 font-mono text-[13px] text-foreground placeholder:text-text-disabled transition-colors duration-150 hover:border-border-strong focus:border-border-strong focus:outline-none disabled:opacity-50';

const PRIMARY =
  'h-8 rounded-[2px] bg-primary px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-40';

const GHOST =
  'h-8 rounded-[2px] border border-border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-foreground disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary';

const CHIP = 'h-8 rounded-[2px] border px-3 text-[13px] leading-none transition-colors duration-150';
const CHIP_ON = 'border-foreground bg-foreground text-background';
const CHIP_OFF = 'border-border text-text-secondary hover:border-border-strong hover:text-foreground';

const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  studio: 'Studio',
  practical: 'Practical location',
  venue: 'Venue',
  exterior: 'Exterior',
  public: 'Public space',
};

function SaveState({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return (
    <span role="status" className="font-mono text-[11px] uppercase tracking-[0.08em] text-status-quoted">
      Unsaved
    </span>
  );
}

function OpenCount({ count }: { count: number }) {
  return (
    <span className="font-mono text-[11px] text-text-tertiary">
      {count === 0 ? 'Nothing left to ask' : `${count} still open`}
    </span>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{label}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One fact. The label carries an OPEN mark while the checklist still needs it. */
function Row({
  label,
  hint,
  open,
  last,
  children,
}: {
  label: string;
  hint?: string;
  open?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2 border-t border-border py-3 sm:flex-row sm:items-start', last && 'border-b')}>
      <div className="w-[160px] shrink-0 sm:pt-2">
        <span className="text-[13px] leading-[19px] text-text-secondary">{label}</span>
        {open && (
          <span className="ml-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-status-quoted" aria-label="still open">
            Open
          </span>
        )}
        {hint && <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-disabled">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Pick one. Clicking the picked one again clears it. */
function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? undefined : o.value)}
            className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Yes or no. Neither picked means "not known yet", which the engine treats differently from no. */
function YesNo({ name, value, onChange }: { name: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  return (
    <Choice
      name={name}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      options={[
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ]}
      onChange={(v) => onChange(v === undefined ? undefined : v === 'yes')}
    />
  );
}

/** Pick any. */
function Checks({
  name,
  options,
  checked,
  onToggle,
}: {
  name: string;
  options: Array<{ value: string; label: string }>;
  checked: (value: string) => boolean;
  onToggle: (value: string, on: boolean) => void;
}) {
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = checked(o.value);
        return (
          <button key={o.value} type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(o.value, !on)} className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A section of booleans with a "none" chip. Checking a chip sets that field
 * true; unchecking sets it false; "none" sets every field false. So the
 * answer is always definite once anything is touched, and the engine stops
 * asking.
 */
function BoolGroup<S extends 'rentals' | 'risks'>({
  name,
  section,
  values,
  options,
  none,
  onCommit,
}: {
  name: string;
  section: S;
  values: Record<string, unknown> | undefined;
  options: Array<{ key: string; label: string }>;
  none: string;
  onCommit: (patch: ProjectProfile) => void;
}) {
  const v = values ?? {};
  const allOff = options.every((o) => v[o.key] === false);
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = v[o.key] === true;
        return (
          <button
            key={o.key}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onCommit({ [section]: { [o.key]: !on } } as ProjectProfile)}
            className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
          >
            {o.label}
          </button>
        );
      })}
      <button
        type="button"
        role="checkbox"
        aria-checked={allOff}
        onClick={() => {
          if (allOff) return;
          onCommit({ [section]: Object.fromEntries(options.map((o) => [o.key, false])) } as ProjectProfile);
        }}
        className={cn(CHIP, allOff ? CHIP_ON : CHIP_OFF)}
      >
        {none}
      </button>
    </div>
  );
}

/** Text that saves on blur or Enter, only when it changed. Empty forgets the fact. */
function TextInput({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder?: string;
  value: string | undefined;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const flush = () => {
    if (draft.trim() !== (value ?? '')) onCommit(draft.trim());
  };
  return (
    <input
      type="text"
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          flush();
        }
      }}
      className={cn(INPUT, 'h-8')}
    />
  );
}

function NumberInput({
  label,
  value,
  min,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  min: number;
  onCommit: (n: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const flush = () => {
    const t = draft.trim();
    const next = t === '' ? undefined : Math.max(min, Math.round(Number(t)));
    if (next !== undefined && !Number.isFinite(next)) return;
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      step={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          flush();
        }
      }}
      className={cn(INPUT, 'h-8 w-[120px]')}
    />
  );
}

/** A date picker commits as it changes: the browser only fires a full date or empty. */
function DateInput({ label, value, onCommit }: { label: string; value: string | undefined; onCommit: (v: string) => void }) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value !== (value ?? '')) onCommit(e.target.value);
      }}
      className={cn(INPUT, 'h-8 w-auto')}
    />
  );
}
