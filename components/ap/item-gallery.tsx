'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LightWell } from './light-well';

/**
 * Item-detail gallery (DESIGN.md §9.5): the big print in the ad. The hero
 * well sits inside a ruled mat on cream, printed on brighter stock (lit).
 * Below, a strip of 64px thumbnail wells; the selected one carries a coral
 * rule, and switching re-prints the hero over the well-reveal timing.
 */
export function ItemGallery({ images, name }: { images: string[]; name: string }) {
  const [selected, setSelected] = useState(0);
  const heroSrc = images[selected];

  return (
    <div className="space-y-4">
      <div className="border-[1.5px] border-ink bg-card p-4 sm:p-6">
        <LightWell
          // Re-key on the source so a thumbnail switch remounts the well and the
          // new plate prints cleanly rather than hard-cutting the image.
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
                className={cn('w-16', i === selected && '!border-coral-deep ring-1 ring-coral-deep')}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
