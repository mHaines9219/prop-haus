'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The light well (DESIGN.md section 4): every inventory photo renders on a
 * neutral plate, never on its own scraped background. White cutouts fuse into
 * the plate via multiply blending; a 6% canvas scrim dims the well at rest and
 * lifts under attention (hover/focus on the parent `.group`).
 *
 * `mode="cutout"` is the default until the ingest-time plate_mode flag lands
 * on item records; most scraped inventory is white-background cutouts.
 */
export function LightWell({
  src,
  alt,
  sizes,
  mode = 'cutout',
  lit = false,
  name,
  className,
}: {
  src?: string;
  alt: string;
  sizes?: string;
  /** cutout: matted contain + multiply. photo: full-bleed cover, no blend. */
  mode?: 'cutout' | 'photo';
  /** Pin the lit plate on (item-detail hero); disables the rest scrim. */
  lit?: boolean;
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
        'relative isolate aspect-[4/5] overflow-hidden rounded-sm border border-border bg-surface-inset',
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
          <div className="absolute inset-0 bg-plate" />
          <div
            className={cn(
              'absolute inset-0 bg-plate-lit transition-opacity duration-[240ms] ease-attend',
              lit
                ? 'opacity-100'
                : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-hover:duration-[180ms]',
            )}
          />
          <div className={mode === 'cutout' ? 'absolute inset-[8%]' : 'absolute inset-0'}>
            <Image
              src={src}
              alt={alt}
              fill
              sizes={sizes}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={cn(
                mode === 'cutout' ? 'object-contain mix-blend-multiply' : 'object-cover',
                'transition-transform duration-[240ms] ease-attend motion-safe:group-hover:scale-[1.025]',
              )}
            />
          </div>
          {!lit && (
            <div className="absolute inset-0 bg-background opacity-[0.06] transition-opacity duration-[240ms] ease-attend group-focus-within:opacity-0 group-hover:opacity-0" />
          )}
        </div>
      ) : (
        <div className="absolute inset-0 bg-plate">
          <div className="absolute inset-0 bg-background opacity-[0.06]" />
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
