import React from 'react';

/** The AVYRO AI app icon — the glowing "A" on a dark rounded-square field. */
export default function AvyroMark({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/avyro-icon.png" width={size} height={size} className={className} alt="AVYRO AI" draggable={false} />
  );
}
