'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LightWell } from './light-well';

/**
 * Item-detail gallery (DESIGN.md section 9.5): the hero light well sits inside a
 * 24px canvas mat bounded by its own hairline frame — a matted, framed print —
 * with the lit plate pinned on (the hero monitor is always awake). Below, a
 * strip of 64px thumbnail wells; the selected one carries a border-strong
 * frame, and switching re-lights the hero over the well-reveal timing.
 */
export function ItemGallery({ images, name }: { images: string[]; name: string }) {
  const [selected, setSelected] = useState(0);
  const heroSrc = images[selected];

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background p-6">
        <LightWell
          // Re-key on the source so a thumbnail switch remounts the well and the
          // new plate lights up cleanly rather than hard-cutting the image.
          key={heroSrc ?? 'empty'}
          src={heroSrc}
          alt={name}
          name={name}
          lit
          sizes="(max-width: 1024px) 100vw, 600px"
          className="mx-auto max-w-[600px]"
        />
      </div>

      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.slice(0, 8).map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`View image ${i + 1}`}
              aria-pressed={i === selected}
              onClick={() => setSelected(i)}
              className="shrink-0"
            >
              <LightWell
                src={src}
                alt={`${name} thumbnail ${i + 1}`}
                sizes="64px"
                className={cn('w-16', i === selected && '!border-border-strong')}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
