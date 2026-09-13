import React from 'react';
import VayoMark from './VayoMark';

/**
 * VAYO's branded loading indicator — a glowing ring spins around a static VAYO mark.
 * Respects prefers-reduced-motion by falling back to a gentle pulse instead of a spin.
 */
export default function VayoLoader({ size = 96, label = 'Loading VAYO…' }: { size?: number; label?: string }) {
  const ringSize = size;
  const markSize = Math.round(size * 0.5);

  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
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
        <VayoMark size={markSize} className="rounded-2xl shadow-lg" />
      </div>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}
