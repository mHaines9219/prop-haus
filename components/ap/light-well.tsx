'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * LightWell — Party Line treatment (DESIGN.md §4): the picture in the ad.
 *
 * Every inventory photo prints onto cream stock inside a hairline ink rule,
 * the way the line drawings sit in the reference ads. White-background
 * cutouts (most scraped inventory) use multiply blend so the white disappears
 * into the paper and only the object is "printed". Full-bleed photos print
 * as-is, edge to edge.
 *
 * The plate is always paper, whichever scope the well sits in: a photo never
 * prints on green vinyl.
 */
export function LightWell({
  src,
  alt,
  sizes,
  mode = 'cutout',
  lit = false,
  fill = false,
  name,
  className,
}: {
  src?: string;
  alt: string;
  sizes?: string;
  /** cutout: paper plate + multiply blend. photo: full-bleed, no blend. */
  mode?: 'cutout' | 'photo';
  /** Brighter stock (pure white) for the hero print on the item page. */
  lit?: boolean;
  /** Drop the 4:5 aspect ratio and fill the parent container instead (marquee cell). */
  fill?: boolean;
  /** Shown on the bare plate when the image is missing or fails. */
  name?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden border border-ink/70 bg-card',
        fill ? 'h-full w-full' : 'aspect-[4/5]',
        className,
      )}
    >
      {showImage ? (
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-[320ms] ease-reveal',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        >
          {mode === 'cutout' ? (
            <div className={cn('absolute inset-0', lit ? 'bg-plate-lit' : 'bg-plate')}>
              <div className="absolute inset-[7%]">
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes={sizes}
                  onLoad={() => setLoaded(true)}
                  onError={() => setFailed(true)}
                  className="object-contain mix-blend-multiply transition-transform duration-[240ms] ease-attend motion-safe:group-hover:scale-[1.025]"
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-plate-lit">
              <Image
                src={src}
                alt={alt}
                fill
                sizes={sizes}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                className="object-cover transition-transform duration-[240ms] ease-attend motion-safe:group-hover:scale-[1.025]"
              />
            </div>
          )}
        </div>
      ) : (
        <div className={cn('absolute inset-0', lit ? 'bg-plate-lit' : 'bg-plate')}>
          {name && (
            <span className="absolute inset-0 grid place-items-center px-4 text-center font-heading text-[13px] font-bold uppercase leading-[16px] tracking-[0.04em] text-ink/70">
              {name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
