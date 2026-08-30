'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * LightWell — Nocturne treatment (DESIGN.md section 4).
 *
 * Photos blend into the dark canvas via mix-blend-mode: lighten — dark parts
 * of the image fall away into the background. White-background cutouts render
 * on a neutral-200 plate (#e3e4de) with multiply blend so the plate fuses
 * into the card surface.
 *
 * `mode="cutout"` is the default; most scraped inventory is white-background.
 * `mode="photo"` uses lighten blend for full-bleed dark-background shots.
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
  /** cutout: neutral-200 plate + multiply blend. photo: lighten blend, full-bleed. */
  mode?: 'cutout' | 'photo';
  /** Retained for API compatibility; shows plate without scrim in Nocturne. */
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
        'relative isolate overflow-hidden rounded-md border border-border bg-card',
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
            <div className="absolute inset-0 bg-plate">
              <div className="absolute inset-[8%]">
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
            <div className="absolute inset-0">
              <Image
                src={src}
                alt={alt}
                fill
                sizes={sizes}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                className="object-cover [mix-blend-mode:lighten] transition-transform duration-[240ms] ease-attend motion-safe:group-hover:scale-[1.025]"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 bg-plate">
          {name && (
            <span className="absolute inset-0 grid place-items-center px-4 text-center font-mono text-[13px] leading-[18px] text-[#0F0F10]">
              {name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
