import React from 'react';

/**
 * AVYRO AI's loading indicator — a glowing blue arc spins around a dark badge holding the "A" mark.
 * Falls back to a gentle pulse under prefers-reduced-motion.
 */
export default function AvyroLoader({ size = 96, label = 'Loading…' }: { size?: number; label?: string }) {
  const badgeSize = Math.round(size * 0.82);
  const markSize = Math.round(size * 0.42);

  return (
    <div className="flex flex-col items-center" role="status" aria-live="polite">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          className="absolute inset-0 motion-safe:animate-spin motion-reduce:animate-pulse"
          style={{ animationDuration: '1.4s', filter: 'drop-shadow(0 0 4px rgba(22,156,255,0.7))' }}
        >
          <circle cx="50" cy="50" r="44" fill="none" stroke="#071A38" strokeWidth="6" opacity="0.35" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="#169CFF" strokeWidth="6" strokeLinecap="round" strokeDasharray="140 200" />
        </svg>
        <div
          className="flex items-center justify-center rounded-full shadow-lg"
          style={{ width: badgeSize, height: badgeSize, background: 'radial-gradient(circle at 35% 30%, #0d1f3d 0%, #050A16 75%)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/avyro-mark.png" width={markSize} height={markSize} alt="AVYRO AI" draggable={false} />
        </div>
      </div>
      {label && <span className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>}
    </div>
  );
}
