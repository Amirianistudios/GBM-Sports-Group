'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * Provider-hosted portrait with a graceful fallback. Portrait URLs are stored
 * by design and never mirrored, which means they can 404 or be blocked — a
 * broken-image glyph is not acceptable, so failures (and missing URLs) render
 * an initials monogram instead. next/image handles sizing, lazy loading and
 * CDN optimization; explicit dimensions prevent layout shift.
 */
export function PlayerPhoto({
  src,
  name,
  size = 64,
  priority = false,
}: {
  src: string | null;
  name: string;
  size?: number;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return (
      <div
        aria-hidden="true"
        className="portrait flex items-center justify-center font-bold select-none"
        style={{
          width: size,
          height: size,
          color: 'var(--muted)',
          fontSize: Math.round(size / 3.2),
          letterSpacing: '0.02em',
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      priority={priority}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="portrait"
      style={{ width: size, height: size }}
    />
  );
}
