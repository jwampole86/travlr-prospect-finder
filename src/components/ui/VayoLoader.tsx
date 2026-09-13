import React from 'react';

/**
 * VAYO's branded loading indicator — a glowing electric-blue ring spins around a dark
 * badge containing the V mark, the VAYO wordmark, and a caption. Respects
 * prefers-reduced-motion by falling back to a gentle pulse instead of a spin.
 */
export default function VayoLoader({ size = 96, label = 'Loading…' }: { size?: number; label?: string }) {
  const ringSize = size;
  const badgeSize = Math.round(size * 0.82);
  const iconSize = Math.round(size * 0.26);

  return (
    <div className="flex flex-col items-center" role="status" aria-live="polite">
      <div className="relative flex items-center justify-center" style={{ width: ringSize, height: ringSize }}>
        <svg
          width={ringSize}
          height={ringSize}
          viewBox="0 0 100 100"
          className="absolute inset-0 motion-safe:animate-spin motion-reduce:animate-pulse"
          style={{ animationDuration: '1.4s' }}
        >
          <circle cx="50" cy="50" r="44" fill="none" stroke="#071A38" strokeWidth="6" opacity="0.35" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#169CFF"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="140 200"
          />
        </svg>
        <div
          className="flex flex-col items-center justify-center gap-1.5 rounded-full shadow-lg"
          style={{ width: badgeSize, height: badgeSize, background: 'radial-gradient(circle at 35% 30%, #0d1f3d 0%, #050A16 75%)' }}
        >
          <svg width={iconSize} height={iconSize} viewBox="0 0 64 64" role="img" aria-label="VAYO">
            <path d="M14 16 L24 16 L32 40 L22 40 Z" fill="#EAF6FF" />
            <path d="M50 16 L40 16 L26 48 L36 48 Z" fill="#169CFF" />
          </svg>
          <span className="text-white font-bold tracking-widest" style={{ fontSize: Math.max(10, Math.round(size * 0.13)) }}>
            VAYO
          </span>
          {label && (
            <span className="text-[9px] text-white/60 uppercase tracking-[0.2em]" style={{ fontSize: Math.max(7, Math.round(size * 0.075)) }}>
              {label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
