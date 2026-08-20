'use client';

import { useState } from 'react';

/**
 * Provider-hosted portrait with a graceful fallback. Portrait URLs are stored
 * by design and never mirrored, which means they can 404 or be blocked — a
 * broken-image glyph in the profile header is not acceptable, so failures
 * (and missing URLs) render an initials monogram instead.
 */
export function PlayerPhoto({ src, name, size = 64 }: { src: string | null; name: string; size?: number }) {
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
        className="rounded-[4px] shrink-0 flex items-center justify-center font-bold select-none"
        style={{
          width: size,
          height: size,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="rounded-[4px] object-cover shrink-0"
      style={{ width: size, height: size, border: '1px solid var(--border)' }}
    />
  );
}
